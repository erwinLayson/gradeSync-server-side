import type{Request, Response, NextFunction} from "express"

// Service Functions
import {
    assignFacultiesToSubjectService,
    createSubjectService, 
    getAllSubjectsService, 
    getSubjectByIdService,
    getSubjectByIdWithFacultiesService,
    getSubjectsNotInClassService,
    getSubjectsWithAssignedFacultiesNotInClassService,
    getFacultiesUnassignedToSubjectService,
    unassignFacultyFromSubjectService,
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


export async function getSubjectByIdWithFacultiesController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;


    if(id === undefined || isNaN(id)) {
       throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    try {
        const subjectWithFaculties = await getSubjectByIdWithFacultiesService(id);
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subject with faculties retrieved successfully",
                    data: subjectWithFaculties
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get faculties unassigned to a specific subject
export async function getFacultiesUnassignedToSubjectController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;

    if(id === undefined || isNaN(id)) {
        throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    try {
        const unassignedFaculties = await getFacultiesUnassignedToSubjectService(id);
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Unassigned faculties retrieved successfully",
                    data: unassignedFaculties
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// Assign faculties to a specific subject
export async function assignFacultiesToSubjectController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const {facultiesId} = req.body;


    if(id === undefined || isNaN(id)) {
        throw new BadRequestError(`Invalid subject ID: ${id}`);
    }

    if(!Array.isArray(facultiesId)) {
        throw new BadRequestError(`Invalid faculties ID: ${facultiesId}`);
    }

    try {
        await assignFacultiesToSubjectService({subjectId: id, facultiesId});
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Faculties assigned to subject successfully",
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// Remove a faculty from a subject's faculty pool
// DELETE /api/subjects/:subjectId/faculties/:facultyId
export async function unassignFacultyFromSubjectController(req: Request<{subjectId: number, facultyId: number}>, res: Response, next: NextFunction) {
    const { subjectId, facultyId } = req.params;

    if (subjectId === undefined || isNaN(subjectId) || facultyId === undefined || isNaN(facultyId)) {
        throw new BadRequestError(`Invalid subject/faculty ID`);
    }

    try {
        const result = await unassignFacultyFromSubjectService(Number(subjectId), Number(facultyId));
        res.status(200).json(
            SuccessResponse({
                message: "Faculty removed from subject successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// get subjects with assigned faculties not in a specific class controller
export async function getSubjectsWithAssignedFacultiesNotInClassController(req: Request<{classId: number, subjectId: number}>, res: Response, next: NextFunction) {
    const {classId, subjectId} = req.params;

    if(classId === undefined || isNaN(classId)) {
        throw new BadRequestError(`Invalid class ID: ${classId}`);
    }

    if(subjectId === undefined || isNaN(subjectId)) {
        throw new BadRequestError(`Invalid subject ID: ${subjectId}`);
    }

    try {
        const subjectsWithFaculties = await getSubjectsWithAssignedFacultiesNotInClassService({classId, subjectId});
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Subjects with assigned faculties not in class retrieved successfully",
                    data: subjectsWithFaculties
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get subjects with Faculties not in a specific class controller
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