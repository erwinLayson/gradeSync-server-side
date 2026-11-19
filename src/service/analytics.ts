import AnalyticsModel from "../model/analytics.js";
import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError } from "../middleware/errors.js";

import { getQuarterGradeAggregates } from "./gradeAggregates.js";
import { getCurrentQuarter } from "./academicSettings.js";

export interface StudentRankingItem {
    rank: number;
    studentId: number;
    studentLrn: string;
    studentName: string;
    gradeLevel: number;
    section: string;
    generalAverage: number;
}

export interface GradeLevelRankingGroup {
    gradeLevel: number;
    totalEligible: number;
    rankings: StudentRankingItem[];
}

export interface StudentQuarterlyRankingsResponse {
    schoolYearId: number;
    quarter: number;
    gradeLevel: number | null;
    groups: GradeLevelRankingGroup[];
}

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

/**
 * Calculates academic rankings for all eligible students based on their official
 * finalized quarterly general averages.
 *
 * Rules:
 * - Rankings are calculated independently for each grade level.
 * - Never combines or compares students from different grade levels.
 * - Every grade level starts ranking from Rank 1.
 * - Only includes students whose quarterly records have been officially finalized (`status = 'submitted'`).
 * - Excludes incomplete, missing, or unfinalized averages.
 * - Uses Standard Competition Ranking ("1224" ranking) for ties:
 *   e.g. 98.50 (Rank 1), 97.25 (Rank 2), 97.25 (Rank 2), 96.00 (Rank 4).
 */
export async function getStudentQuarterlyRankingsService(
    schoolYearId: number,
    quarter: number,
    gradeLevel?: number
): Promise<StudentQuarterlyRankingsResponse> {
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        throw new BadRequestError("Quarter must be an integer between 1 and 4");
    }

    if (!Number.isInteger(schoolYearId) || schoolYearId <= 0) {
        throw new BadRequestError("schoolYearId must be a positive integer");
    }

    if (gradeLevel !== undefined && (!Number.isInteger(gradeLevel) || gradeLevel <= 0)) {
        throw new BadRequestError("gradeLevel must be a positive integer");
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const analyticsModel = new AnalyticsModel(connection);

        // Fetch raw finalized quarterly data from the model
        const rawRows = await analyticsModel.getStudentQuarterlyRankings(schoolYearId, quarter, gradeLevel);

        // Determine grade levels to display
        const targetGradeLevelsSet = new Set<number>();
        if (gradeLevel !== undefined) {
            targetGradeLevelsSet.add(gradeLevel);
        } else {
            const availableLevels = await analyticsModel.getGradeLevelsForSchoolYear(schoolYearId);
            for (const gl of availableLevels) {
                targetGradeLevelsSet.add(gl);
            }
        }
        for (const row of rawRows) {
            targetGradeLevelsSet.add(row.classGradeLevel);
        }

        const sortedGradeLevels = Array.from(targetGradeLevelsSet).sort((a, b) => a - b);

        // Group rows by classGradeLevel
        const rowsByGradeLevel = new Map<number, {
            studentId: number;
            studentLrn: string;
            studentName: string;
            classGradeLevel: number;
            classSection: string;
            generalAverage: number;
        }[]>();

        for (const row of rawRows) {
            // General average is the arithmetic mean across all graded subjects for this quarter,
            // rounded to 2 decimal places.
            const generalAverage = Math.round((Number(row.totalGrade) / Number(row.totalSubjects)) * 100) / 100;
            const list = rowsByGradeLevel.get(row.classGradeLevel) ?? [];
            list.push({
                studentId: row.studentId,
                studentLrn: row.studentLrn,
                studentName: row.studentName,
                classGradeLevel: row.classGradeLevel,
                classSection: row.classSection,
                generalAverage
            });
            rowsByGradeLevel.set(row.classGradeLevel, list);
        }

        const groups: GradeLevelRankingGroup[] = [];

        for (const gl of sortedGradeLevels) {
            const studentsInLevel = rowsByGradeLevel.get(gl) ?? [];

            // Sort by general average descending; tie-break deterministically by name, then studentId
            studentsInLevel.sort((a, b) => {
                if (b.generalAverage !== a.generalAverage) {
                    return b.generalAverage - a.generalAverage;
                }
                const nameCompare = a.studentName.localeCompare(b.studentName);
                if (nameCompare !== 0) {
                    return nameCompare;
                }
                return a.studentId - b.studentId;
            });

            // Standard competition ranking (1224 ranking) starting from Rank 1
            const rankings: StudentRankingItem[] = [];
            let currentRank = 1;

            for (let i = 0; i < studentsInLevel.length; i++) {
                const current = studentsInLevel[i]!;
                if (i === 0) {
                    currentRank = 1;
                } else {
                    const prev = studentsInLevel[i - 1]!;
                    if (current.generalAverage !== prev.generalAverage) {
                        currentRank = i + 1;
                    }
                }

                rankings.push({
                    rank: currentRank,
                    studentId: current.studentId,
                    studentLrn: current.studentLrn,
                    studentName: current.studentName,
                    gradeLevel: current.classGradeLevel,
                    section: current.classSection,
                    generalAverage: current.generalAverage
                });
            }

            groups.push({
                gradeLevel: gl,
                totalEligible: rankings.length,
                rankings
            });
        }

        return {
            schoolYearId,
            quarter,
            gradeLevel: gradeLevel ?? null,
            groups
        };
    } finally {
        connection.release();
    }
}
