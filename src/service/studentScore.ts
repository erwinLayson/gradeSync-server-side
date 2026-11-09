import StudentScoreModel from "../model/studentScore.js";
import AssessmentModel from "../model/assessment.js";
import ClassSubjectSubmissionModel from "../model/classSubjectSubmission.js";
import StudentRecordModel from "../model/studentRecord.js";

import type { PoolConnection } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";

import { BadRequestError, ForbiddenError, NotFoundError } from "../middleware/errors.js";
import type { RowDataPacket } from "mysql2/promise";
import type { StudentScoreInput } from "../constant/grade.js";
import { getCurrentQuarter, getAcademicSettingsService } from "./academicSettings.js";
import { executeWithAmendmentAudit } from "./amendmentPermission.js";


export async function getStudentScoreService(classSubjectId: number, quarter: number, conn?: PoolConnection) {
  const pool = getDBPoolConnection();
  const connection = conn ??  await pool.getConnection();
  const ownConn = !conn;
  try { 
    const studentScoreModel = new StudentScoreModel(connection);

    const studentScore = await studentScoreModel.getStudentScore(classSubjectId, quarter);
    return studentScore;
  }catch(err) {
    throw err
  }finally {
    if(ownConn) {
      connection.release();
    }
  }
}

// Batch-save the score sheet for one assessment. Every score is validated
// to be within [0, maxScore] of the assessment before saving. The submitted
// sheet is authoritative: the assessment's old rows are cleared first (so
// cleared cells remove previously saved scores) and the new rows are inserted
// inside one transaction, so a failed save leaves the sheet untouched.
export async function saveAssessmentScoresService(
  assessmentId: number,
  scoreEntries: StudentScoreInput[]
): Promise<void> {
  const pool = getDBPoolConnection();
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const assessmentModel = new AssessmentModel(connection);
    const assessment = await assessmentModel.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new NotFoundError(`Assessment with ID ${assessmentId} not found`, 404);
    }

    const maxScore = Number(assessment.maxScore);
    const settings = await getAcademicSettingsService();
    const currentQuarter = settings?.currentQuarter ?? 1;
    if (Boolean(settings?.submissionsLocked)) {
      throw new ForbiddenError("All score submissions are locked by the administrator");
    }
    if (assessment.quarter < currentQuarter) {
      throw new ForbiddenError(
        `Quarter ${assessment.quarter} is locked. Bulk-saving is disabled for past quarters. Submit an Amendment Request to modify an individual student's score.`
      );
    }

    // Check if the teacher has already submitted this class subject for this quarter
    const recordModel = new StudentRecordModel(connection);
    const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
    if (activeSchoolYearId) {
      const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
      const submission = await classSubjectSubmissionModel.getSubmission(
        assessment.classSubjectId,
        assessment.quarter,
        activeSchoolYearId
      );
      if (submission?.status === "submitted") {
        throw new ForbiddenError(
          `Quarter ${assessment.quarter} grades for this class subject have already been submitted. Submit an Amendment Request to modify an individual student's score.`
        );
      }
    }

    // Check if individual students are already submitted for this quarter
    const studentScoreModel = new StudentScoreModel(connection);
    const existingScores = await studentScoreModel.getScoresByAssessmentId(assessmentId);
    const existingScoreByEnrollmentId = new Map(existingScores.map((s) => [s.enrollmentId, Number(s.score)]));

    const submittedEnrollmentIds = new Set<number>();
    const entryEnrollmentIds = scoreEntries.map((e) => e.enrollmentId);
    if (entryEnrollmentIds.length > 0) {
      const records = await recordModel.getRecordsByEnrollmentIds(entryEnrollmentIds);
      const recordIds = records.map((r) => r.id);
      const subjectRows = await recordModel.getSubjectRowsByRecordIds(recordIds);
      const classSubject = await recordModel.getClassSubjectById(assessment.classSubjectId);
      if (classSubject) {
        for (const row of subjectRows) {
          if (
            row.subjectName.toLowerCase() === classSubject.subjectName.toLowerCase() ||
            row.subjectCode.toLowerCase() === classSubject.subjectCode.toLowerCase()
          ) {
            const col = assessment.quarter === 1 ? row.q1 : assessment.quarter === 2 ? row.q2 : assessment.quarter === 3 ? row.q3 : row.q4;
            if (col !== null && col !== undefined) {
              const rec = records.find((r) => r.id === row.recordId);
              if (rec) submittedEnrollmentIds.add(rec.enrollmentId);
            }
          }
        }
      }
    }

    for (const scoreEntry of scoreEntries) {
      if (submittedEnrollmentIds.has(scoreEntry.enrollmentId)) {
        const existingScore = existingScoreByEnrollmentId.get(scoreEntry.enrollmentId);
        if (existingScore !== undefined && existingScore !== scoreEntry.score) {
          throw new ForbiddenError(
            `Quarter ${assessment.quarter} grade for this student has already been submitted. Submit an Amendment Request to modify their score.`
          );
        }
      }
    }

    // Ensure submitted students who were graded are not omitted from scoreEntries
    for (const enrolledId of submittedEnrollmentIds) {
      const existingScore = existingScoreByEnrollmentId.get(enrolledId);
      if (existingScore !== undefined) {
        const hasEntry = scoreEntries.some((e) => e.enrollmentId === enrolledId);
        if (!hasEntry) {
          scoreEntries.push({ enrollmentId: enrolledId, score: existingScore });
        }
      }
    }

    for (const scoreEntry of scoreEntries) {
      if (scoreEntry.score < 0 || scoreEntry.score > maxScore) {
        throw new BadRequestError(
          `Score ${scoreEntry.score} for enrollment ${scoreEntry.enrollmentId} must be between 0 and ${maxScore}`
        );
      }
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await studentScoreModel.deleteScoresByAssessment(assessmentId);
    await studentScoreModel.upsertScoresBatch(assessmentId, scoreEntries);

    await connection.commit();
  } catch (err) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw err;
  } finally {
    connection.release();
  }
}

// Atomically save a single student's score under an approved amendment permission
export async function saveSingleStudentScoreService(
  assessmentId: number,
  enrollmentId: number,
  newScore: number,
  actor: { id: number; facultyId: number | null; role: string },
  clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  const pool = getDBPoolConnection();
  const connection = await pool.getConnection();

  await connection.beginTransaction();
  try {
    const assessmentModel = new AssessmentModel(connection);
    const assessment = await assessmentModel.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new NotFoundError(`Assessment with ID ${assessmentId} not found`, 404);
    }

    const maxScore = Number(assessment.maxScore);
    if (newScore < 0 || newScore > maxScore) {
      throw new BadRequestError(`Score ${newScore} must be between 0 and ${maxScore}`);
    }

    // Fetch existing score for beforeState
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT score FROM student_scores WHERE assessmentId = ? AND enrollmentId = ? LIMIT 1",
      [assessmentId, enrollmentId]
    );
    const beforeState = existingRows[0] ? { score: Number(existingRows[0].score) } : null;
    const afterState = { score: newScore };

    await executeWithAmendmentAudit(
      connection,
      actor,
      {
        enrollmentId,
        classSubjectId: assessment.classSubjectId,
        quarter: assessment.quarter,
        recordType: "gradebook_score",
        assessmentId,
      },
      {
        targetTable: "student_scores",
        targetRecordId: `${assessmentId}-${enrollmentId}`,
        beforeState,
        reason: "Score amended via approved request",
        ipAddress: clientMeta?.ipAddress,
        userAgent: clientMeta?.userAgent,
      },
      async () => {
        const studentScoreModel = new StudentScoreModel(connection);
        await studentScoreModel.upsertScoresBatch(assessmentId, [{ enrollmentId, score: newScore }]);
        return { result: undefined, afterState };
      }
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}