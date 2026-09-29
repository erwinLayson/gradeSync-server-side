import { getRemarks } from "./getRemarks.js";

export interface GeneralAverage {
    score: number | null;
    remarks: string;
}

/**
 * The only thing the general average needs from a subject: its final rating.
 * Narrower than the report card's `Subjects` type on purpose, so every caller
 * (SF9, SF10, academic history) can use this helper instead of re-implementing
 * the average.
 */
export interface GradedSubject {
    finalGrades: number | null;
}

/**
 * Computes the general average across all graded subjects.
 * Returns { score: null, remarks: "N/A" } when no subjects have a final grade.
 *
 * Single source of truth for the general average across the whole application.
 */
export function computeGeneralAverage(subjects: GradedSubject[]): GeneralAverage {
    const gradedSubjects = subjects.filter((sub) => sub.finalGrades !== null);

    if (gradedSubjects.length === 0) {
        return { score: null, remarks: "N/A" };
    }

    const total = gradedSubjects.reduce((sum, sub) => sum + sub.finalGrades!, 0);
    const score = Math.round((total / gradedSubjects.length) * 100) / 100;

    return {
        score,
        remarks: getRemarks(score),
    };
}
