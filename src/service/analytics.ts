import AnalyticsModel from "../model/analytics.js";
import { getDBPoolConnection } from "../config/database.js";

import { getQuarterGradeAggregates } from "./gradeAggregates.js";
import { getCurrentQuarter } from "./academicSettings.js";

// Aggregates the admin analytics dashboard data. When the optional
// schoolYearId is provided every school-year-scoped metric is filtered to it;
// counts of faculties / classrooms are global (they are not year-scoped).
//
// The grade metrics (averageGrade, passingRate, passingCount, gradedEnrollments,
// subjectPerformance, topPerformers) are REAL grades for the configured current
// quarter, produced by the central grading engine — see
// service/gradeAggregates.ts. They are deliberately not SQL score averages.
export async function getAnalyticsService(schoolYearId?: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const analyticsModel = new AnalyticsModel(connection);
        const quarter = await getCurrentQuarter();

        const [
            students,
            faculties,
            classrooms,
            enrollmentByGrade,
            gradeAggregates,
            attendanceTrend,
            schoolYearsWithEnrollments,
            studentsPerSchoolYear,
            enrollmentBySex,
            attendanceToday,
            newStudentsThisWeek,
            enrollmentCount
        ] = await Promise.all([
            analyticsModel.getStudentCount(schoolYearId),
            analyticsModel.getFacultyCount(),
            analyticsModel.getClassroomCount(),
            analyticsModel.getEnrollmentByGradeLevel(schoolYearId),
            getQuarterGradeAggregates(schoolYearId, quarter),
            analyticsModel.getAttendanceTrend(schoolYearId),
            analyticsModel.getSchoolYearsWithEnrollments(),
            analyticsModel.getEnrollmentPerSchoolYear(),
            analyticsModel.getEnrollmentBySex(schoolYearId),
            analyticsModel.getAttendanceToday(schoolYearId),
            analyticsModel.getNewStudentsThisWeek(schoolYearId),
            analyticsModel.getEnrollmentCount(schoolYearId)
        ]);

        return {
            students,
            faculties,
            classrooms,
            // The quarter the grade metrics below are scoped to.
            quarter,
            averageGrade: gradeAggregates.averageGrade,
            passingRate: gradeAggregates.passingRate,
            passingCount: gradeAggregates.passingCount,
            gradedEnrollments: gradeAggregates.gradedEnrollments,
            enrollmentByGrade,
            subjectPerformance: gradeAggregates.subjectPerformance,
            topPerformers: gradeAggregates.topPerformers,
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
