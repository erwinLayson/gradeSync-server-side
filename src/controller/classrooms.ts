import type{Request, Response, NextFunction} from "express"

// Service Functions
import {
    createClassroomService, 
    getAllClassroomsService, 
    getClassroomByIdService,
    getClassroomTeachersWithSubjectService,
    getClassAdviserService,
    setClassAdviserService,
    updateClassroomService,
    archiveClassroomService
} from "../service/classrooms.js";

// Types constants
import type { ClassroomResponse, NewClassroomSubject } from "../constant/classrooms.js";
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import NormalizedData from "../helper/normalizedData.js";

// Controller Functions
export async function CreateClassroomController(req: Request<{}, {}, Omit<ClassroomResponse, "id">>, res: Response, next: NextFunction) {
    const {gradeLevel, section} = req.body;
    try {
        const classroom = {gradeLevel, section: NormalizedData(section, true)};

        // validate classroom data
        Validate(classroom);

        await createClassroomService(classroom);
        res.status(201).json(
            SuccessResponse(
                {
                    message: "Classroom created successfully",
                }
            )
        )
    }catch(err) {
        next(err);
    }
}

// update classroom (section + grade level)
// PUT /api/classrooms/:id
// Body: { section: string, gradeLevel: number }
export async function updateClassroomController(req: Request<{id: string}, {}, { section: string; gradeLevel: string | number }>, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { section, gradeLevel } = req.body;
    try {
        const classroom = { gradeLevel, section: NormalizedData(section, true) };

        // validate classroom data (same rules as create)
        Validate(classroom);

        await updateClassroomService(Number(id), classroom);
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classroom updated successfully",
                }
            )
        )
    } catch (err) {
        next(err);
    }
}

// archive classroom (soft delete)
// DELETE /api/classrooms/:id
export async function archiveClassroomController(req: Request<{id: string}>, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
        await archiveClassroomService(Number(id));
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classroom archived",
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get all classrooms 
export async function getAllClassroomController(req: Request, res: Response, next: NextFunction) {
    try {
        const classrooms = await getAllClassroomsService();
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classrooms retrieved successfully",
                    data: classrooms
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get classroom by ID
export async function getClassroomByIdController(req: Request<{id: string}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    try {
        const classroom = await getClassroomByIdService(Number(id));
        
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classroom retrieved successfully",
                    data: classroom
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get classroom teachers with subject
export async function getClassroomTeachersWithSubjectController(req: Request<{classroomId: string}>, res: Response, next: NextFunction) {
    const {classroomId} = req.params;
    try {
        const classroomTeachersWithSubject = await getClassroomTeachersWithSubjectService(Number(classroomId));
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classroom teachers with subject retrieved successfully",
                    data: classroomTeachersWithSubject
                }
            )
        );
    } catch (err) {
        next(err);
    }
}

// get class adviser
// GET /api/classrooms/:id/adviser
export async function getClassAdviserController(req: Request<{id: string}>, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
        const adviser = await getClassAdviserService(Number(id));
        res.status(200).json(
            SuccessResponse({
                message: "Class adviser retrieved successfully",
                data: adviser
            })
        );
    } catch (err) {
        next(err);
    }
}

// assign (or clear) class adviser
// PUT /api/classrooms/:id/adviser  body: { teacherId: number | null }
export async function setClassAdviserController(req: Request<{id: string}, {}, { teacherId: number | null }>, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { teacherId } = req.body;

    // teacherId may be null (clear adviser); otherwise it must be a positive integer.
    const parsedTeacherId = teacherId === null || teacherId === undefined ? null : Number(teacherId);
    if (parsedTeacherId !== null && (Number.isNaN(parsedTeacherId) || parsedTeacherId <= 0)) {
        res.status(400).json({ success: false, message: "teacherId must be a positive number or null" });
        return;
    }

    try {
        await setClassAdviserService(Number(id), parsedTeacherId);
        res.status(200).json(
            SuccessResponse({
                message: parsedTeacherId === null ? "Class adviser removed successfully" : "Class adviser assigned successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}
