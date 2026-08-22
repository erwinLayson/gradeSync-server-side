import { getGradeBookDetailsByClassSubjectIdService } from "../service/gradebook.js";
import type { ClassRecordSubject } from "../constant/studentRecord.js";

/**
 * Whole-class computed grades: enrollmentId -> (subjectId -> grade|null).
 * Fetches gradebook data for each subject and builds a matrix keyed by
 * enrollment and subject IDs.
 */
export async function computeClassGradeMatrix(
    subjects: ClassRecordSubject[],
    quarter: number
): Promise<Map<number, Map<number, number | null>>> {
    const matrix = new Map<number, Map<number, number | null>>();
    for (const subject of subjects) {
        const gradebook = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
        for (const row of gradebook.student) {
            let bySubject = matrix.get(row.enrollmentId);
            if (!bySubject) {
                bySubject = new Map();
                matrix.set(row.enrollmentId, bySubject);
            }
            bySubject.set(subject.subjectId, row.quarterGrade);
        }
    }
    return matrix;
}
