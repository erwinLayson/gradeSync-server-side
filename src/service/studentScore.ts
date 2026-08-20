import StudentScoreModel from "../model/studentScore.js";
import AssessmentModel from "../model/assessment.js";

import type { PoolConnection } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";

import { BadRequestError, NotFoundError } from "../middleware/errors.js";

import type { StudentScoreInput } from "../constant/grade.js";


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
    for (const scoreEntry of scoreEntries) {
      if (scoreEntry.score < 0 || scoreEntry.score > maxScore) {
        throw new BadRequestError(
          `Score ${scoreEntry.score} for enrollment ${scoreEntry.enrollmentId} must be between 0 and ${maxScore}`
        );
      }
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const studentScoreModel = new StudentScoreModel(connection);
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