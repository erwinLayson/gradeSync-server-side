import { getFacultyByIdService } from "../service/faculties.js";
import { getClassAdviserService } from "../service/classrooms.js";

/**
 * Resolves who "signs" a submission: the faculty's id + name snapshot,
 * or the class adviser when the caller is an admin (facultyId === null).
 */
export async function resolveSubmitter(
    classId: number,
    facultyId: number | null
): Promise<{ submittedBy: number | null; adviserName: string }> {
    if (facultyId !== null) {
        const faculty = await getFacultyByIdService(facultyId);
        return { submittedBy: faculty.id, adviserName: faculty.fullname };
    }
    const adviser = await getClassAdviserService(classId);
    return { submittedBy: adviser.adviserId, adviserName: adviser.adviserFullname ?? "" };
}
