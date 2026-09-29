import AnalyticsModel from "../model/analytics.js";
import { getDBPoolConnection } from "../config/database.js";

import { getGradeBookDetailsByClassSubjectIdService } from "./gradebook.js";
import { isPassing } from "../helper/getRemarks.js";

// ============================================================================
// School-wide grade aggregates for the admin dashboard and the analytics page.
//
// These are REAL grades, so they are produced by the central engine
// (getGradeBookDetailsByClassSubjectIdService -> computeQuarterGrade /
// computeCompositeQuarterGrade), never by a separate SQL average. The metric
// that used to live here — AVG((score/maxScore)*100) — ignored assessment type
// weights, the attendance weight, component weights and the quarter rules, so
// it could disagree with the grade a student actually received.
//
// Scope: the configured CURRENT quarter (matching the "Current quarter" label
// in the UI) and, when provided, a single school year.
//
// Cost: one central-engine evaluation per graded class subject, and the engine
// issues several queries per call. The model pre-filters to class subjects that
// actually have assessments or attendance so ungraded subjects cost nothing.
// ============================================================================

export interface SubjectPerformanceRow {
    subject: string;
    /** Mean of this subject's quarter grades (0-100). */
    score: number | null;
    /** Share of this subject's quarter grades at or above the passing mark, in %. */
    passRate: number | null;
    /** How many quarter grades the row is based on. */
    gradedCount: number;
}

export interface TopPerformerRow {
    studentId: number;
    fullname: string;
    section: string;
    /** Mean of the student's subject quarter grades for the current quarter. */
    grade: number;
}

export interface QuarterGradeAggregates {
    /** Mean of every computed subject quarter grade in scope. */
    averageGrade: number | null;
    /** Enrollments that have at least one computed quarter grade. */
    gradedEnrollments: number;
    passingCount: number;
    /** Share of graded enrollments averaging at or above the passing mark, in %. */
    passingRate: number | null;
    subjectPerformance: SubjectPerformanceRow[];
    topPerformers: TopPerformerRow[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
// One decimal, for percentages that are already on a 0-100 scale.
const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

interface EnrollmentTally {
    studentId: number;
    fullname: string;
    section: string;
    grades: number[];
}

/**
 * Aggregates the current quarter's grades across the school using the central
 * grading engine. Returns zeros/nulls when nothing has been graded yet.
 */
export async function getQuarterGradeAggregates(
    schoolYearId: number | undefined,
    quarter: number
): Promise<QuarterGradeAggregates> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    let classSubjects: { classSubjectId: number; subjectName: string }[];
    try {
        classSubjects = await new AnalyticsModel(connection).getGradedClassSubjects(schoolYearId);
    } finally {
        connection.release();
    }

    const allGrades: number[] = [];
    const gradesBySubject = new Map<string, number[]>();
    const tallies = new Map<number, EnrollmentTally>();

    for (const classSubject of classSubjects) {
        let details;
        try {
            details = await getGradeBookDetailsByClassSubjectIdService(classSubject.classSubjectId, quarter);
        } catch {
            continue; // the class subject vanished mid-flight — skip it
        }

        for (const student of details.student) {
            const grade = student.quarterGrade;
            if (grade === null || grade === undefined) {
                continue;
            }

            allGrades.push(grade);

            const subjectGrades: number[] = gradesBySubject.get(classSubject.subjectName) ?? [];
            subjectGrades.push(grade);
            gradesBySubject.set(classSubject.subjectName, subjectGrades);

            const tally: EnrollmentTally = tallies.get(student.enrollmentId) ?? {
                studentId: student.studentId,
                fullname: student.fullname,
                section: details.classSection,
                grades: []
            };
            tally.grades.push(grade);
            tallies.set(student.enrollmentId, tally);
        }
    }

    const enrollmentAverages = [...tallies.values()].map((tally) => mean(tally.grades));
    const passingCount = enrollmentAverages.filter((average) => isPassing(average)).length;

    const subjectPerformance: SubjectPerformanceRow[] = [...gradesBySubject.entries()]
        .map(([subject, grades]) => ({
            subject,
            score: round2(mean(grades)),
            passRate: round1((grades.filter((grade) => isPassing(grade)).length / grades.length) * 100),
            gradedCount: grades.length
        }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const topPerformers: TopPerformerRow[] = [...tallies.values()]
        .map((tally) => ({
            studentId: tally.studentId,
            fullname: tally.fullname,
            section: tally.section,
            grade: round2(mean(tally.grades))
        }))
        .sort((a, b) => b.grade - a.grade)
        .slice(0, 5);

    return {
        averageGrade: allGrades.length > 0 ? round2(mean(allGrades)) : null,
        gradedEnrollments: tallies.size,
        passingCount,
        passingRate: enrollmentAverages.length > 0 ? round1((passingCount / enrollmentAverages.length) * 100) : null,
        subjectPerformance,
        topPerformers
    };
}
