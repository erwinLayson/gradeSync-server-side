import { getGradeBookDetailsByClassSubjectIdService } from "../service/gradebook.js";
import type { ClassRecordSubject } from "../constant/studentRecord.js";
import type { ComponentGrade } from "../constant/subjectComponents.js";

/**
 * One subject's computed grade for one enrollment, straight from the central
 * grading engine: the quarter grade plus, for composite subjects, each
 * component's grade. The freeze step stores both together.
 */
export interface ComputedSubjectGrade {
    grade: number | null;
    componentGrades: ComponentGrade[];
}

/**
 * Whole-class computed grades: enrollmentId -> (subjectId -> computed grade).
 * Each row comes from getGradeBookDetailsByClassSubjectIdService, i.e. the same
 * computeQuarterGrade / computeCompositeQuarterGrade the gradebook uses.
 */
export async function computeClassGradeMatrix(
    subjects: ClassRecordSubject[],
    quarter: number
): Promise<Map<number, Map<number, ComputedSubjectGrade>>> {
    const matrix = new Map<number, Map<number, ComputedSubjectGrade>>();
    for (const subject of subjects) {
        const gradebook = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
        for (const row of gradebook.student) {
            let bySubject = matrix.get(row.enrollmentId);
            if (!bySubject) {
                bySubject = new Map();
                matrix.set(row.enrollmentId, bySubject);
            }
            bySubject.set(subject.subjectId, {
                grade: row.quarterGrade,
                componentGrades: row.componentGrades ?? []
            });
        }
    }
    return matrix;
}
