import { calculateFinalGrade } from "./calculateFinalGrade.js";
import { getRemarks } from "./getRemarks.js";
import type { Subjects, ComponentGradeRow } from "../constant/report-card.js";

interface QuarterlyGradeRow {
    subjectName: string;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
}

/**
 * Builds a list of Subjects from quarterly grade rows and optional
 * sub-component grades (e.g., Music, Arts, PE, Health under MAPEH).
 */
export function buildSubjectList(
    quarterlyGrades: QuarterlyGradeRow[],
    componentGradesBySubject: Map<string, ComponentGradeRow[]>
): Subjects[] {
    const subjectMap = new Map<string, Subjects>();

    for (const quarterlyGrade of quarterlyGrades) {
        const finalGrade = calculateFinalGrade({
            q1: quarterlyGrade.q1 != null ? String(quarterlyGrade.q1) : null,
            q2: quarterlyGrade.q2 != null ? String(quarterlyGrade.q2) : null,
            q3: quarterlyGrade.q3 != null ? String(quarterlyGrade.q3) : null,
            q4: quarterlyGrade.q4 != null ? String(quarterlyGrade.q4) : null,
        });

        subjectMap.set(quarterlyGrade.subjectName, {
            name: quarterlyGrade.subjectName,
            quarters: {
                q1: quarterlyGrade.q1,
                q2: quarterlyGrade.q2,
                q3: quarterlyGrade.q3,
                q4: quarterlyGrade.q4,
            },
            finalGrades: finalGrade,
            remarks: finalGrade !== null ? getRemarks(finalGrade) : "N/A",
            components: componentGradesBySubject.get(quarterlyGrade.subjectName),
        });
    }

    return Array.from(subjectMap.values());
}
