import type{Request, Response, NextFunction} from "express"

// Service Functions
import {
    createClassroomService, 
    getAllClassroomsService, 
    getClassroomByIdService,
    getClassroomFacultiesWithSubjectService,
    getClassAdviserService,
    setClassAdviserService,
    updateClassroomService,
    archiveClassroomService,
    getMyAdvisedClassService,
    getMyAdvisedClassHonorStudentsService
} from "../service/classrooms.js";

// Types constants
import type { ClassroomResponse } from "../constant/classrooms.js";
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import NormalizedData from "../helper/normalizedData.js";
import { resolveFacultyIdByUserIdService } from "../service/studentRecord.js";
import { getCurrentQuarter, getNumQuarters } from "../service/academicSettings.js";
import { isValidQuarter } from "../helper/quarterValidation.js";

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
export async function getAllClassroomController(_req: Request, res: Response, next: NextFunction) {
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

// get classroom faculties with subject
export async function getClassroomFacultiesWithSubjectController(req: Request<{classroomId: string}>, res: Response, next: NextFunction) {
    const {classroomId} = req.params;
    try {
        const classroomFacultiesWithSubject = await getClassroomFacultiesWithSubjectService(Number(classroomId));
        res.status(200).json(
            SuccessResponse(
                {
                    message: "Classroom faculties with subject retrieved successfully",
                    data: classroomFacultiesWithSubject
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

// get the class the logged-in faculty advises
// GET /api/classrooms/my-advised-class
export async function getMyAdvisedClassController(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: "Unauthorized" });
            return;
        }
        const facultyId = await resolveFacultyIdByUserIdService(userId);
        const result = await getMyAdvisedClassService(facultyId);
        res.status(200).json(
            SuccessResponse({
                message: "Advised class retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// get the honor roll of the class the logged-in faculty advises
// GET /api/classrooms/my-advised-class/honor-students?quarter=1
// Returns null when the faculty advises no class (feature stays adviser-only).
// Every student whose average meets HONOR_STUDENT_PASSING_GRADE is included.
export async function getMyAdvisedClassHonorStudentsController(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: "Unauthorized" });
            return;
        }

        const quarterRaw = req.query.quarter;
        let quarter = await getCurrentQuarter();
        if (quarterRaw !== undefined && quarterRaw !== "") {
            const parsedQuarter = Number(quarterRaw);
            const numQuarters = await getNumQuarters();
            if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
                res.status(400).json({
                    success: false,
                    message: `quarter must be a number between 1 and ${numQuarters}`
                });
                return;
            }
            quarter = parsedQuarter;
        }

        const facultyId = await resolveFacultyIdByUserIdService(userId);
        const result = await getMyAdvisedClassHonorStudentsService(facultyId, quarter);
        res.status(200).json(
            SuccessResponse({
                message: "Advised class honor students retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// assign (or clear) class adviser
// PUT /api/classrooms/:id/adviser  body: { facultyId: number | null }
export async function setClassAdviserController(req: Request<{id: string}, {}, { facultyId: number | null }>, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { facultyId } = req.body;

    // facultyId may be null (clear adviser); otherwise it must be a positive integer.
    const parsedFacultyId = facultyId === null || facultyId === undefined ? null : Number(facultyId);
    if (parsedFacultyId !== null && (Number.isNaN(parsedFacultyId) || parsedFacultyId <= 0)) {
        res.status(400).json({ success: false, message: "facultyId must be a positive number or null" });
        return;
    }

    try {
        await setClassAdviserService(Number(id), parsedFacultyId);
        res.status(200).json(
            SuccessResponse({
                message: parsedFacultyId === null ? "Class adviser removed successfully" : "Class adviser assigned successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}
