import { getTeacherByIdService } from "../service/teachers.js";
import { getClassAdviserService } from "../service/classrooms.js";

/**
 * Resolves who "signs" a submission: the teacher's id + name snapshot,
 * or the class adviser when the caller is an admin (teacherId === null).
 */
export async function resolveSubmitter(
    classId: number,
    teacherId: number | null
): Promise<{ submittedBy: number | null; adviserName: string }> {
    if (teacherId !== null) {
        const teacher = await getTeacherByIdService(teacherId);
        return { submittedBy: teacher.id, adviserName: teacher.fullname };
    }
    const adviser = await getClassAdviserService(classId);
    return { submittedBy: adviser.adviserId, adviserName: adviser.adviserFullname ?? "" };
}
