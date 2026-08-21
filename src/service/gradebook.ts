import GradeBookModel from "../model/gradebook.js"
import { getDBPoolConnection } from "../config/database.js";


// ================== Service =================
import {getAssessmentService} from "./assessment.js"
import {getStudentByClassroomIdService} from "./students.js"
import {getStudentScoreService} from "./studentScore.js";
import { getGradingWeightsService } from "./gradingWeight.js";
import { getStudentAttendanceByClassSubjectIdService } from "./studentAttendance.js";

// =============== types =================
import type { PoolConnection } from "mysql2/promise";
import type {GradeWeights, StudentScoreProps, StudentAttendanceProps} from "../constant/grade.js"
import type { AssessmentType, AssessmentProps } from "../constant/assessment.js";
import type {StudentWithClassroom} from "../constant/students.js";

// ==================== middleware ============
import { NotFoundError } from "../middleware/errors.js";
import { formatDate } from "../helper/formatDate.js";


export async function getGradeBookDetailsByClassSubjectIdService(classSubjectId: number, quarter: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const gradeDookModel = new GradeBookModel(connection);

        const classSubjectDetails = await gradeDookModel.getGradeBookDetailsByClassSubjectId(classSubjectId, quarter);

        if(!classSubjectDetails || !classSubjectDetails.classSubjectId) {
            throw new NotFoundError("Class Subject Not Found", 404);
        }

        const assessment = await getAssessmentService({classSubjectId, quarter}, connection);
        // NOTE: getStudentByClassroomIdService expects a classrooms.id (classId), NOT a class_subjects.id
        const studentRoaster = await getStudentByClassroomIdService(classSubjectDetails.classId, connection)
        const rowStudentScore = await getStudentScoreService(classSubjectId, quarter, connection);
        // Weights are per CLASS SUBJECT (each teacher's own configuration), so
        // look them up with the class_subjects id, not the shared subject id.
        const gradingWeights = await getGradingWeightsService(classSubjectDetails.classSubjectId, connection)
        // NOTE: attendance is PER SUBJECT (keyed by classSubjectId), so each
        // subject in a class has its own attendance records — a student can be
        // present in one subject and absent in another on the same day.
        const attendanceByEnrollmentId = await getAttendanceByEnrollmentId(classSubjectDetails.classSubjectId, connection, quarter)

        const student = buildStudent(studentRoaster, assessment, gradingWeights, rowStudentScore, attendanceByEnrollmentId)

        return {
            ...classSubjectDetails,
            quarter,
            assessment: assessment.map(ass => ({
                ...ass,
                created_at: formatDate(ass.created_at)
            })),
            gradingWeights,
            student
        };
    }finally {
        connection.release();
    }
}


async function getAttendanceByEnrollmentId(classSubjectId: number, connection: PoolConnection, quarter?: number) {
    const attendanceRows: StudentAttendanceProps[] = await getStudentAttendanceByClassSubjectIdService(classSubjectId, connection, quarter);

    const attendanceByEnrollmentId = new Map<number, { presentDays: number; totalDays: number }>();
    for(const row of attendanceRows) {
        attendanceByEnrollmentId.set(row.enrollmentId, {
            presentDays: row.presentDays,
            totalDays: row.totalDays
        });
    }
    return attendanceByEnrollmentId;
}

function getGradedAssessments(
    assessments: AssessmentProps[],
    studentScoresByAssessmentId: Record<number, number>
): AssessmentProps[] {
    return assessments.filter((assessment) => studentScoresByAssessmentId[assessment.id] !== undefined);
}

function buildStudent(
    studentRoaster: StudentWithClassroom[],
    assessment: AssessmentProps[],
    gradingWeights: GradeWeights,
    rowStudentScore: StudentScoreProps[],
    attendanceByEnrollmentId: Map<number, { presentDays: number; totalDays: number }>
) {
    // Scores are keyed by enrollmentId because student_scores now references the
    // enrollments table; the roster provides each student's enrollmentId.
    const scoresByEnrollmentId = new Map<number, Record<number, number>>() 

    for(const scoreRow of rowStudentScore) {
        const studentScoresByAssessmentId = scoresByEnrollmentId.get(scoreRow.enrollmentId) ?? {}
        studentScoresByAssessmentId[scoreRow.assessmentId] = Number(scoreRow.score);
        scoresByEnrollmentId.set(scoreRow.enrollmentId, studentScoresByAssessmentId);
    }

    const roaster = studentRoaster.map((sr) => {
        const studentScoreAssessmentById = scoresByEnrollmentId.get(sr.enrollmentId) ?? {};

        // Attendance summary for this student (null when no attendance has been recorded,
        // which keeps classes without attendance data completely unaffected).
        const studentAttendance = attendanceByEnrollmentId.get(sr.enrollmentId) ?? null;
        const attendance = studentAttendance && studentAttendance.totalDays > 0
            ? {
                presentDays: studentAttendance.presentDays,
                totalDays: studentAttendance.totalDays,
                // Clamp at 100 in case bad data ever records more presents than total days.
                percentage: Math.min(100, Math.round((studentAttendance.presentDays / studentAttendance.totalDays) * 10000) / 100)
            }
            : null;

        const quarterGrade = computeQuarterGrade(assessment, studentScoreAssessmentById, gradingWeights, attendance)

        // Only count assessments the student has actually been graded on, so the
        // totals stay consistent with the graded-only quarterGrade computation.
        const gradedAssessments = getGradedAssessments(assessment, studentScoreAssessmentById);

        // The filter guarantees the score exists, so the non-null assertion is safe
        // (required because noUncheckedIndexedAccess types the record access as number | undefined).
        const totalScore = gradedAssessments.reduce(
            (runningSum, ass) => runningSum + studentScoreAssessmentById[ass.id]!,
            0
        );

        const totalMaxScore = gradedAssessments.reduce(
            (runningSum, ass) => runningSum + Number(ass.maxScore),
            0
        );

            return {
            enrollmentId: sr.enrollmentId,
            studentId: sr.studentId,
            studentLrn: sr.studentLrn,
            fullname: sr.fullname,
            scores: studentScoreAssessmentById,
            totalScore,
            totalMaxScore,
            attendance,
            quarterGrade,
            remarks: getRemarksForQuarterGrade(quarterGrade)
        };
    })

    return roaster;
}

export function computeQuarterGrade(
    assessments: AssessmentProps[],
    studentScoresByAssessmentId: Record<number, number>,
    gradeWeights: GradeWeights,
    attendance?: { presentDays: number; totalDays: number } | null
): number | null {
    // Normalize with Number() because grading_weights columns are DECIMAL and come back
    // from the driver as strings ("20.00"); without this the += below would string-
    // concatenate instead of adding.
    const weightByAssessmentType: Record<AssessmentType, number> = {
        written_work: Number(gradeWeights.writtenWorkWeight),
        performance_task: Number(gradeWeights.performanceTaskWeight),
        quarterly_assessment: Number(gradeWeights.quarterlyAssessmentWeight),
    };

    const assessmentTypes: AssessmentType[] = ["written_work", "performance_task", "quarterly_assessment"];

    let weightedPercentageSum = 0;
    let activeWeightSum = 0;

    for (const assessmentType of assessmentTypes) {
        const typeAssessments = assessments.filter((assessment) => assessment.type === assessmentType);
        if (typeAssessments.length === 0) {
            continue; // no assessments of this type -> ignore the type entirely
        }

        // Only assessments the student has actually been graded on count toward the math;
        // not-yet-graded assessments are excluded from BOTH the earned sum and the max sum.
        const gradedAssessments = getGradedAssessments(typeAssessments, studentScoresByAssessmentId);
        if (gradedAssessments.length === 0) {
            continue; // student never graded in this type -> ignore the type entirely
        }

        // The filter above guarantees the score exists, so the non-null assertion is safe
        // (required because noUncheckedIndexedAccess types the record access as number | undefined).
        const earnedScoreSum = gradedAssessments.reduce(
            (runningSum, assessment) => runningSum + studentScoresByAssessmentId[assessment.id]!,
            0
        );
        // maxScore is a DECIMAL column and comes back from the driver as a string
        // ("20.00"), so it must be coerced before summing — otherwise the reduce
        // string-concatenates and the grade becomes NaN.
        const maxScoreSum = gradedAssessments.reduce(
            (runningSum, assessment) => runningSum + Number(assessment.maxScore),
            0
        );
        if (maxScoreSum === 0) {
            continue; // guard against a division by zero
        }

        const typePercentage = (earnedScoreSum / maxScoreSum) * 100;
        weightedPercentageSum += typePercentage * weightByAssessmentType[assessmentType];
        activeWeightSum += weightByAssessmentType[assessmentType];
    }

    // Attendance component (optional, teacher-configured weight per subject). Counted only
    // when the student has attendance records AND the weight is positive, so classes without
    // attendance data are completely unaffected.
    const attendanceWeight = Number(gradeWeights.attendanceWeight);
    if (attendance && attendance.totalDays > 0 && attendanceWeight > 0) {
        const attendancePercentage = (attendance.presentDays / attendance.totalDays) * 100;
        weightedPercentageSum += attendancePercentage * attendanceWeight;
        activeWeightSum += attendanceWeight;
    }

    if (activeWeightSum === 0) {
        return null;
    }
    return Math.round((weightedPercentageSum / activeWeightSum) * 100) / 100;
}


export function getRemarksForQuarterGrade(quarterGrade: number | null): string | null {
    if (quarterGrade === null) {
        return null;
    }
    return quarterGrade >= 75 ? "Passed" : "Failed";
}