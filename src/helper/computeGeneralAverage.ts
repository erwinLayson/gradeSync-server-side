import { getRemarks } from "./getRemarks.js";
import type { Subjects } from "../constant/report-card.js";

export interface GeneralAverage {
    score: number | null;
    remarks: string;
}

/**
 * Computes the general average across all graded subjects.
 * Returns { score: null, remarks: "N/A" } when no subjects have a final grade.
 */
export function computeGeneralAverage(subjects: Subjects[]): GeneralAverage {
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
