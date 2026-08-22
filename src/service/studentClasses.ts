import { getDBPoolConnection } from "../config/database.js";

import StudentClassesModel from "../model/studentClasses.js";
import StudentDetailsModel from "../model/studentDetails.js";
import StudentRecordModel from "../model/studentRecord.js";

// Grade computation building blocks (reused from the teacher gradebook)
import { getAssessmentService } from "./assessment.js";
import { getStudentScoreService } from "./studentScore.js";
import { getGradingWeightsService } from "./gradingWeight.js";
import { getAttendanceHistoryService } from "./studentAttendance.js";
import { computeQuarterGrade, getRemarksForQuarterGrade } from "./gradebook.js";

// Error handling
import { NotFoundError } from "../middleware/errors.js";
import { formatDate } from "../helper/formatDate.js";

import type { GradeWeights } from "../constant/grade.js";
import type { StudentScoreProps } from "../constant/grade.js";

function formatStudentRow(row: any) {
    return {
        id: Number(row.id),
        lrn: row.lrn,
        email: row.email,
        fullname: [row.firstname, row.middlename, row.lastname]
            .filter(Boolean)
            .join(" ") + (row.suffix ? ` ${row.suffix}` : "")
    };
}

// The logged-in user's classes (all enrolled school years) with per-subject
// quarterly grades, finals, remarks, and the general average per class.
export async function getMyClassesService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);

        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        return await getStudentAcademicHistoryService(studentId);
    } finally {
        connection.release();
    }
}

// Academic history for one student (all enrolled school years) with per-subject
// quarterly grades, finals, remarks, and the general average per class. Shared
// by the student self-service view and the admin student-details view.
export async function getStudentAcademicHistoryService(studentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);

        const studentDetailsModel = new StudentDetailsModel(connection);
        const studentRow = await studentDetailsModel.getStudentRow(studentId);
        if (studentRow === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        const enrollments = await model.getEnrollmentsByStudentId(studentId);

        const studentRecordModel = new StudentRecordModel(connection);
        const classes = [];
        for (const enrollment of enrollments) {
            // Frozen-first: a submitted academic record is the official, immutable
            // history. When one exists, render it exactly like the SF10 PDF — the
            // record's own section/grade/adviser snapshots and the frozen per-subject
            // grades — instead of today's live class structure, which drifts from
            // what was actually taught that year. Without a record (e.g. the current
            // in-progress school year) fall back to the live gradebook below.
            const frozenRecords = await studentRecordModel.getRecordsByEnrollmentIds([enrollment.enrollmentId]);
            const frozenRecord = frozenRecords[0] ?? null;
            if (frozenRecord) {
                const subjectRows = await studentRecordModel.getSubjectRowsByRecordIds([frozenRecord.id]);

                // Whole-number rounding mirrors the SF10 PDF display (E8); the DB
                // keeps the exact decimals. Remarks follow the PDF's Passed/Failed
                // rule at the 75 mark. Frozen rows have no live gradebook data, so
                // classSubjectId/teacher/unit/assessments/attendance are null/empty.
                const subjects = subjectRows.map((row) => {
                    const quarters: (number | null)[] = [row.q1, row.q2, row.q3, row.q4].map((q) =>
                        q === null || q === undefined ? null : Math.round(Number(q))
                    );
                    const present = quarters.filter((q): q is number => q !== null);
                    const final =
                        present.length > 0
                            ? Math.round(present.reduce((sum, g) => sum + g, 0) / present.length)
                            : null;
                    return {
                        classSubjectId: null,
                        subjectId: null,
                        name: row.subjectName,
                        code: row.subjectCode,
                        unit: null,
                        teacher: null,
                        quarters,
                        final,
                        remarks: final === null ? null : final >= 75 ? "Passed" : "Failed",
                        assessments: [],
                        attendance: []
                    };
                });

                const finals = subjects
                    .map((subject) => subject.final)
                    .filter((grade): grade is number => grade !== null);
                const generalAverage =
                    finals.length > 0
                        ? Math.round((finals.reduce((sum, g) => sum + g, 0) / finals.length) * 100) / 100
                        : null;

                classes.push({
                    enrollmentId: enrollment.enrollmentId,
                    classId: enrollment.classId,
                    section: frozenRecord.classSection,
                    gradeLevel: frozenRecord.classGradeLevel,
                    schoolYearId: enrollment.schoolYearId,
                    schoolYear: `${enrollment.startYear}-${enrollment.endYear}`,
                    adviser: frozenRecord.adviserName,
                    subjects,
                    generalAverage
                });
                continue;
            }

            const classroom = await model.getClassWithAdviser(enrollment.classId);
            if (classroom === null) {
                continue; // classroom was deleted; skip the orphaned enrollment
            }

            const subjectRows = await model.getClassSubjectsByClassId(enrollment.classId);
            const subjects = [];

            for (const subjectRow of subjectRows) {
                // Weights are per class subject (same for all quarters).
                const weights: GradeWeights = await getGradingWeightsService(subjectRow.classSubjectId, connection);

                // Full attendance history for this enrollment (records carry quarter).
                const attendanceHistory = await getAttendanceHistoryService(
                    subjectRow.classSubjectId,
                    enrollment.enrollmentId,
                    undefined,
                    undefined,
                    connection
                );

                // Attendance summary + records grouped per quarter (1-4).
                const attendanceByQuarter = [1, 2, 3, 4].map((quarter) => {
                    const records = attendanceHistory.records.filter((record) => record.quarter === quarter);
                    const presentDays = records.filter((record) => record.status === "present").length;
                    const totalDays = records.length;
                    return {
                        quarter,
                        presentDays,
                        totalDays,
                        percentage:
                            totalDays > 0
                                ? Math.min(100, Math.round((presentDays / totalDays) * 10000) / 100)
                                : null,
                        records: records.map((record) => ({ date: record.date, status: record.status }))
                    };
                });

                const quarters: (number | null)[] = [];
                const assessments: {
                    id: number;
                    quarter: number;
                    type: string;
                    title: string;
                    maxScore: number;
                    dateGiven: string | null;
                    score: number | null;
                }[] = [];
                for (let quarter = 1; quarter <= 4; quarter++) {
                    // Filter attendance to THIS quarter only — the gradebook
                    // must not bleed attendance from other quarters into this one.
                    const quarterRecords = attendanceHistory.records.filter((r) => r.quarter === quarter);
                    const quarterAttendance = quarterRecords.length > 0
                        ? {
                            presentDays: quarterRecords.filter((r) => r.status === "present").length,
                            totalDays: quarterRecords.length
                        }
                        : null;

                    const assessmentRows = await getAssessmentService(
                        { classSubjectId: subjectRow.classSubjectId, quarter },
                        connection
                    );
                    const scores: StudentScoreProps[] = await getStudentScoreService(
                        subjectRow.classSubjectId,
                        quarter,
                        connection
                    );

                    // Scores keyed by assessment id for THIS student's enrollment.
                    const scoresByAssessmentId: Record<number, number> = {};
                    for (const score of scores) {
                        if (score.enrollmentId === enrollment.enrollmentId) {
                            scoresByAssessmentId[score.assessmentId] = Number(score.score);
                        }
                    }

                    quarters.push(computeQuarterGrade(assessmentRows, scoresByAssessmentId, weights, quarterAttendance));

                    for (const assessment of assessmentRows) {
                        const dateGiven = assessment.dateGiven;
                        assessments.push({
                            id: assessment.id,
                            quarter: assessment.quarter,
                            type: assessment.type,
                            title: assessment.title,
                            maxScore: Number(assessment.maxScore),
                            dateGiven: dateGiven ? formatDate(dateGiven) : null,
                            score: scoresByAssessmentId[assessment.id] ?? null
                        });
                    }
                }

                const gradedQuarters = quarters.filter((grade): grade is number => grade !== null);
                const final =
                    gradedQuarters.length > 0
                        ? Math.round((gradedQuarters.reduce((sum, g) => sum + g, 0) / gradedQuarters.length) * 100) / 100
                        : null;

                subjects.push({
                    classSubjectId: subjectRow.classSubjectId,
                    subjectId: subjectRow.subjectId,
                    name: subjectRow.name,
                    code: subjectRow.code,
                    unit: subjectRow.unit !== null && subjectRow.unit !== undefined ? Number(subjectRow.unit) : null,
                    teacher: subjectRow.teacherFullname,
                    quarters,
                    final,
                    remarks: getRemarksForQuarterGrade(final),
                    assessments,
                    attendance: attendanceByQuarter
                });
            }

            const finals = subjects
                .map((subject) => subject.final)
                .filter((grade): grade is number => grade !== null);
            const generalAverage =
                finals.length > 0
                    ? Math.round((finals.reduce((sum, g) => sum + g, 0) / finals.length) * 100) / 100
                    : null;

            classes.push({
                enrollmentId: enrollment.enrollmentId,
                classId: classroom.id,
                section: classroom.section,
                gradeLevel: classroom.gradeLevel,
                schoolYearId: enrollment.schoolYearId,
                schoolYear: `${enrollment.startYear}–${enrollment.endYear}`,
                adviser: classroom.adviserFullname,
                subjects,
                generalAverage
            });
        }

        return {
            student: formatStudentRow(studentRow),
            classes
        };
    } finally {
        connection.release();
    }
}
