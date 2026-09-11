import type{Request, Response, NextFunction} from "express"

// Service Functions
import {
    assignTeachersToSubjectService,
    createSubjectService, 
    getAllSubjectsService, 
    getSubjectByIdService,
    getSubjectByIdWithTeachersService,
    getSubjectsNotInClassService,
    getSubjectsWithAssignedTeachersNotInClassService,
    getTeachersUnassignedToSubjectService,
    unassignTeacherFromSubjectService,
    updateSubjectService,
    deleteSubjectService
} from "../service/subjects.js";

// Types constants
import type { Subject } from "../constant/subjects.js";
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import { BadRequestError } from "../middleware/errors.js";
import NormalizedData from "../helper/normalizedData.js";

// create a new subject controller
export async function CreateSubjectController(req: Request<{}, {}, Omit<Subject, "id">>, res: Response, next: NextFunction) {
    const {name, code, unit} = req.body;
    try {
        const subject = {name: NormalizedData(name, true), code, unit};

        Validate(subject);

        await createSubjectService(subject);
        res.status(201).json(
            SuccessResponse(
                {
                    message: "Subject created successfully",
                }
            )
        )
    }catch(err) {
        next(err);
    }
}

// update subject (name, code, unit)
// PUT /api/subjects/:id
// Body: { name: string, code: string, unit: number }
export async function updateSubjectController(req: Request<{id: number}, {}, { name: string; code: string; unit: string | number }>, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { name, code, unit } = req.body;
    try {
        const subject = { name: NormalizedData(name, true), code, unit };

        // validate subject data (same rules as create)
        Validate(subject);

        await updateSubjectService(Number(id), subject);
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subject updated successfully",
                }
            )
        )
    } catch (err) {
        next(err);
    }
}

// delete subject (blocked while the subject is still referenced)
// DELETE /api/subjects/:id
export async function deleteSubjectController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
        await deleteSubjectService(Number(id));
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subject deleted successfully",
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get all subjects
export async function getAllSubjectController(_req: Request, res: Response, next: NextFunction) {
    try {
        const subjects = await getAllSubjectsService();
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subjects retrieved successfully",
                    data: subjects
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get subject by ID
export async function getSubjectByIdController(req: Request<{id: string}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    try {
        const subject = await getSubjectByIdService(Number(id));
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subject retrieved successfully",
                    data: subject
                }
            )
        );
    } catch (err) {
        next(err);
    }
}


export async function getSubjectByIdWithTeachersController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;


    if(id === undefined || isNaN(id)) {
       throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    try {
        const subjectWithTeachers = await getSubjectByIdWithTeachersService(id);
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subject with teachers retrieved successfully",
                    data: subjectWithTeachers
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get teachers unassigned to a specific subject
export async function getTeachersUnassignedToSubjectController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;

    if(id === undefined || isNaN(id)) {
        throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    try {
        const unassignedTeachers = await getTeachersUnassignedToSubjectService(id);
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Unassigned teachers retrieved successfully",
                    data: unassignedTeachers
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// Assign teachers to a specific subject
export async function assignTeachersToSubjectController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const {teachersId} = req.body;


    if(id === undefined || isNaN(id)) {
        throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    if(!Array.isArray(teachersId)) {
        throw new BadRequestError(`Invalid teachers ID: ${teachersId}`);
    }

    try {
        await assignTeachersToSubjectService({subjectId: id, teachersId});
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Teachers assigned to subject successfully",
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// Remove a teacher from a subject's teacher pool
// DELETE /api/subjects/:subjectId/teachers/:teacherId
export async function unassignTeacherFromSubjectController(req: Request<{subjectId: number, teacherId: number}>, res: Response, next: NextFunction) {
    const { subjectId, teacherId } = req.params;

    if (subjectId === undefined || isNaN(subjectId) || teacherId === undefined || isNaN(teacherId)) {
        throw new BadRequestError(`Invalid subject/teacher ID`);
    }

    try {
        const result = await unassignTeacherFromSubjectService(Number(subjectId), Number(teacherId));
        res.status(200).json(
            SuccessResponse({
                message: "Teacher removed from subject successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// get subjects with assigned teachers not in a specific class controller
export async function getSubjectsWithAssignedTeachersNotInClassController(req: Request<{classId: number, subjectId: number}>, res: Response, next: NextFunction) {
    const {classId, subjectId} = req.params;

    if(classId === undefined || isNaN(classId)) {
        throw new BadRequestError(`Invalid class ID: ${classId}`);
    }

    if(subjectId === undefined || isNaN(subjectId)) {
        throw new BadRequestError(`Invalid subject ID: ${subjectId}`);
    }

    try {
        const subjectsWithTeachers = await getSubjectsWithAssignedTeachersNotInClassService({classId, subjectId});
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subjects with assigned teachers not in class retrieved successfully",
                    data: subjectsWithTeachers
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get subjects with Teachers not in a specific class controller
export async function getSubjectsNotInClassController(req: Request<{classId: number}>, res: Response, next: NextFunction) {
    const {classId} = req.params;

    if(classId === undefined || isNaN(classId)) {
        throw new BadRequestError(`Invalid class ID: ${classId}`);
    }

    try {
        const subjectsNotInClass = await getSubjectsNotInClassService(classId);
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subjects not in class retrieved successfully",
                    data: subjectsNotInClass
                }
            )
        );
    } catch (err) {
        next(err);
    }
}