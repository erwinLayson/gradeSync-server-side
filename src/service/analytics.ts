import AnalyticsModel from "../model/analytics.js";
import { getDBPoolConnection } from "../config/database.js";

// Aggregates the admin analytics dashboard data. When the optional
// schoolYearId is provided every school-year-scoped metric is filtered to it;
// counts of teachers / classrooms are global (they are not year-scoped).
export async function getAnalyticsService(schoolYearId?: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const analyticsModel = new AnalyticsModel(connection);

        const [
            students,
            teachers,
            classrooms,
            enrollmentByGrade,
            averageGrade,
            enrollmentAverages,
            subjectPerformance,
            topPerformers,
            attendanceTrend,
            schoolYearsWithEnrollments,
            studentsPerSchoolYear,
            enrollmentBySex,
            attendanceToday,
            newStudentsThisWeek,
            enrollmentCount
        ] = await Promise.all([
            analyticsModel.getStudentCount(schoolYearId),
            analyticsModel.getTeacherCount(),
            analyticsModel.getClassroomCount(),
            analyticsModel.getEnrollmentByGradeLevel(schoolYearId),
            analyticsModel.getAverageGrade(schoolYearId),
            analyticsModel.getEnrollmentAverages(schoolYearId),
            analyticsModel.getSubjectPerformance(schoolYearId),
            analyticsModel.getTopPerformers(schoolYearId),
            analyticsModel.getAttendanceTrend(schoolYearId),
            analyticsModel.getSchoolYearsWithEnrollments(),
            analyticsModel.getEnrollmentPerSchoolYear(),
            analyticsModel.getEnrollmentBySex(schoolYearId),
            analyticsModel.getAttendanceToday(schoolYearId),
            analyticsModel.getNewStudentsThisWeek(schoolYearId),
            analyticsModel.getEnrollmentCount(schoolYearId)
        ]);

        // Passing rate = share of graded enrollments averaging >= 75.
        const passing = enrollmentAverages.filter((average) => average >= 75).length;
        const passingRate = enrollmentAverages.length > 0
            ? Math.round((passing / enrollmentAverages.length) * 1000) / 10
            : null;

        return {
            students,
            teachers,
            classrooms,
            averageGrade,
            passingRate,
            passingCount: passing,
            gradedEnrollments: enrollmentAverages.length,
            enrollmentByGrade,
            subjectPerformance,
            topPerformers,
            attendanceTrend,
            schoolYearsWithEnrollments,
            studentsPerSchoolYear,
            enrollmentBySex,
            attendanceToday,
            newStudentsThisWeek,
            enrollmentCount
        };
    } finally {
        connection.release();
    }
}
