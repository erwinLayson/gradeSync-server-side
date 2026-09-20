import Dashboard from "../model/dashboard.js";
import { getDBPoolConnection } from "../config/database.js";

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
            averageGrade,
            attendanceToday,
            newStudentsThisWeek,
            enrollmentCount,
            gradedEnrollments,
        ] = await Promise.all([
            connection.execute("SELECT currentQuarter, enrollmentOpen FROM academic_settings LIMIT 1")
                .then(([rows]) => {
                    const row = (rows as Record<string, unknown>[])[0];
                    return row
                        ? { currentQuarter: Number(row.currentQuarter), enrollmentOpen: Boolean(row.enrollmentOpen) }
                        : { currentQuarter: 1, enrollmentOpen: true };
                }),
            model.getStudentCount(schoolYearId),
            model.getTeacherCount(),
            model.getClassroomCount(),
            model.getAverageGrade(schoolYearId),
            model.getAttendanceToday(schoolYearId),
            model.getNewStudentsThisWeek(schoolYearId),
            model.getEnrollmentCount(schoolYearId),
            model.getGradedEnrollments(schoolYearId),
        ]);

        const quarter = academicSettingsResult.currentQuarter;

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
            enrollmentOpen: academicSettingsResult.enrollmentOpen,
            students,
            teachers,
            classrooms,
            averageGrade,
            attendanceToday,
            newStudentsThisWeek,
            gradedEnrollments,
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
