import Dashboard from "../model/dashboard.js";
import { getDBPoolConnection } from "../config/database.js";

import { getQuarterGradeAggregates } from "./gradeAggregates.js";

import type { DashboardSummary } from "../constant/dashboard.js";

export async function getDashboardSummaryService(): Promise<DashboardSummary> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new Dashboard(connection);

        const schoolYear = await model.getActiveSchoolYear();
        const schoolYearId = schoolYear?.id;

        const [
            academicSettingsResult,
            students,
            teachers,
            classrooms,
            attendanceToday,
            newStudentsThisWeek,
            enrollmentCount,
        ] = await Promise.all([
            connection.execute("SELECT currentQuarter, numQuarters, enrollmentOpen FROM academic_settings LIMIT 1")
                .then(([rows]) => {
                    const row = (rows as Record<string, unknown>[])[0];
                    return row
                        ? { currentQuarter: Number(row.currentQuarter), numQuarters: Number(row.numQuarters) || 4, enrollmentOpen: Boolean(row.enrollmentOpen) }
                        : { currentQuarter: 1, numQuarters: 4, enrollmentOpen: true };
                }),
            model.getStudentCount(schoolYearId),
            model.getTeacherCount(),
            model.getClassroomCount(),
            model.getAttendanceToday(schoolYearId),
            model.getNewStudentsThisWeek(schoolYearId),
            model.getEnrollmentCount(schoolYearId),
        ]);

        const quarter = academicSettingsResult.currentQuarter;

        // The average grade and the graded-enrollment count are REAL grades for
        // the current quarter, produced by the central grading engine (the same
        // one the gradebook, records and report cards use).
        const gradeAggregates = await getQuarterGradeAggregates(schoolYearId, quarter);

        const [attentionItems, gradeSubmissionProgress] = await Promise.all([
            schoolYearId
                ? model.buildAttentionItems(schoolYearId, quarter)
                : Promise.resolve([]),
            schoolYearId
                ? model.getGradeSubmissionProgress(schoolYearId, quarter)
                : Promise.resolve(null),
        ]);

        return {
            schoolYear,
            academicQuarter: quarter,
            numQuarters: academicSettingsResult.numQuarters,
            enrollmentOpen: academicSettingsResult.enrollmentOpen,
            students,
            teachers,
            classrooms,
            averageGrade: gradeAggregates.averageGrade,
            attendanceToday,
            newStudentsThisWeek,
            gradedEnrollments: gradeAggregates.gradedEnrollments,
            enrollmentCount,
            attentionItems,
            academicProgress: {
                gradeSubmission: gradeSubmissionProgress,
                classesWithoutAdviser: attentionItems.find((i) => i.id === "no-adviser")?.count ?? 0,
                incompleteClasses: [],
            },
        };
    } finally {
        connection.release();
    }
}
