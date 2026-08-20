import type{Request, Response, NextFunction} from "express";

// Helpers
import Validate from "../helper/validate.js";
import { SuccessResponse } from "../helper/response.js";

import type {ClassSubjectProps} from "../constant/class_subjects.js";
import type { GradeWeights } from "../constant/grade.js";

// Error handling
import { BadRequestError } from "../middleware/errors.js";

// Service Functions
import {
    createClassSubjectService,
    deleteSubjectFromClassService,
    getClasssSubjectDetailsByIdService,
    updateSubjectTeacherByClassIdService
} from "../service/class_subjects.js";
import {
    getGradingWeightsForClassSubjectService,
    upsertGradingWeightsService
} from "../service/gradingWeight.js";


// This function is exported to classrooms routes to create new class subjects
export async function createClassSubjectController(req: Request<{}, {},{newSubjects: Omit<ClassSubjectProps, "id">[]}>, res: Response, next: NextFunction) {
    try {
        const {newSubjects} = req.body;

        // Validate each class subject in the request body
        for(const cs of newSubjects) {
            Validate(cs);
        }

        await createClassSubjectService(newSubjects);
        res.status(201).json(
            SuccessResponse({
                message: "Class subjects created successfully",
            })
        );

    } catch (err) {
        next(err);
    }
}


// This function is exported  to classrooms routes to get class subject details by ID
export async function getClassSubjectDetailsByIdController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;

        // Validate the id parameter
        Validate({id})

        const result = await getClasssSubjectDetailsByIdService(id);
        res.status(200).json(
            SuccessResponse({
                message: `Get class subject details successful`,
                data: result
            })
        )
    } catch (err) {
        next(err);
    }
}

// update the teacher of a subject in a class by classId and subjectId
export async function updateSubjectTeacherByClassIdController(req: Request<{classId: number}, {},  Omit<ClassSubjectProps, "id" | "classId">>, res: Response, next: NextFunction) {
    try {
        const { classId } = req.params;
        const { subjectId, teacherId } = req.body;



        // Validate the classId and newTeacherId
        Validate({classId, ...{subjectId, teacherId}});

        await updateSubjectTeacherByClassIdService(classId, {subjectId, teacherId});

        res.status(200).json(
            SuccessResponse({
                message: `Subject teacher updated successfully`,
            })
        );
    } catch (err) {
        next(err);
    }
}

export async function deleteSubjectFromClassController(req: Request<{classId: number, subjectId: number, teacherId: number}>, res: Response, next: NextFunction) {
    try {
        const { classId, subjectId, teacherId } = req.params;  

        // Validate the classId, subjectId, and teacherId
        Validate({classId, subjectId, teacherId});

        await deleteSubjectFromClassService(classId, subjectId, teacherId);
        res.status(200).json(
            SuccessResponse({
                message: `Subject deleted from class successfully`,
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /class-subjects/:classSubjectId/weights — the effective grading weights of
// a class subject (stored row, or the DepEd defaults when none is saved yet).
export async function getClassSubjectWeightsController(req: Request<{classSubjectId: number}>, res: Response, next: NextFunction) {
    try {
        const { classSubjectId } = req.params;
        Validate({ classSubjectId });

        const parsedClassSubjectId = Number(classSubjectId);
        if (Number.isNaN(parsedClassSubjectId)) {
            throw new BadRequestError("Invalid class subject id");
        }

        const weights = await getGradingWeightsForClassSubjectService(parsedClassSubjectId);

        res.status(200).json(
            SuccessResponse({
                message: "Grading weights retrieved successfully",
                data: weights
            })
        );
    } catch (err) {
        next(err);
    }
}

// PUT /class-subjects/:classSubjectId/weights — create or update the weights of
// a class subject. Mirrors the chk_weights_total DB rule (sum <= 100) with a
// friendly 400 instead of a raw constraint error.
export async function updateClassSubjectWeightsController(req: Request<{classSubjectId: number}, {}, Partial<GradeWeights>>, res: Response, next: NextFunction) {
    try {
        const { classSubjectId } = req.params;
        Validate({ classSubjectId });

        const parsedClassSubjectId = Number(classSubjectId);
        if (Number.isNaN(parsedClassSubjectId)) {
            throw new BadRequestError("Invalid class subject id");
        }

        const weights = parseGradeWeightsPayload(req.body);

        await upsertGradingWeightsService(parsedClassSubjectId, weights);

        // Re-read so the response reflects what was actually stored
        // (the DB rounds to 2 decimals), not just the submitted values.
        const storedWeights = await getGradingWeightsForClassSubjectService(parsedClassSubjectId);

        res.status(200).json(
            SuccessResponse({
                message: "Grading weights updated successfully",
                data: storedWeights
            })
        );
    } catch (err) {
        next(err);
    }
}

// Parse + validate one weight field: required, numeric, and not negative.
function parseGradeWeight(value: unknown, fieldName: string): number {
    // Treat whitespace-only strings (" ") as missing — Number(" ") would be 0.
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        throw new BadRequestError(`${fieldName} is required`);
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new BadRequestError(`${fieldName} must be a number`);
    }
    if (parsed < 0) {
        throw new BadRequestError(`${fieldName} must be 0 or greater`);
    }
    return parsed;
}

// Validate the whole weights payload against the same rule as the
// chk_weights_total CHECK constraint: the four weights must total 100 or less.
function parseGradeWeightsPayload(payload: Partial<GradeWeights>): GradeWeights {
    const writtenWorkWeight = parseGradeWeight(payload.writtenWorkWeight, "writtenWorkWeight");
    const performanceTaskWeight = parseGradeWeight(payload.performanceTaskWeight, "performanceTaskWeight");
    const quarterlyAssessmentWeight = parseGradeWeight(payload.quarterlyAssessmentWeight, "quarterlyAssessmentWeight");
    const attendanceWeight = parseGradeWeight(payload.attendanceWeight, "attendanceWeight");

    const total = writtenWorkWeight + performanceTaskWeight + quarterlyAssessmentWeight + attendanceWeight;
    if (total > 100) {
        throw new BadRequestError(
            `Grading weights total ${total}, which exceeds the maximum of 100`
        );
    }

    return { writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight };
}