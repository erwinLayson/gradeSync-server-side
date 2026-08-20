import type { Request, Response, NextFunction } from "express";

import {
    createAssessmentService,
    getAssessmentService,
    updateAssessmentService,
    deleteAssessmentService
} from "../service/assessment.js";
import { saveAssessmentScoresService } from "../service/studentScore.js";

import type { AssessmentCreateProps, AssessmentType, AssessmentUpdateProps } from "../constant/assessment.js";
import type { StudentScoreInput } from "../constant/grade.js";

import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import { BadRequestError } from "../middleware/errors.js";

// Create a new assessment for a class subject within a quarter.
export async function createAssessmentController(
    req: Request<{}, {}, AssessmentCreateProps>,
    res: Response,
    next: NextFunction
) {
    try {
        const { classSubjectId, quarter, type, title, maxScore, dateGiven } = req.body;

        Validate({ classSubjectId, quarter, type, title, maxScore });

        const parsedClassSubjectId = Number(classSubjectId);
        const parsedQuarter = Number(quarter);
        const parsedMaxScore = Number(maxScore);

        if (Number.isNaN(parsedClassSubjectId)) {
            throw new BadRequestError("Class subject id must be a valid number");
        }
        if (Number.isNaN(parsedQuarter) || parsedQuarter < 1 || parsedQuarter > 4) {
            throw new BadRequestError("Quarter must be a number between 1 and 4");
        }
        if (!isValidAssessmentType(type)) {
            throw new BadRequestError("Type must be written_work, performance_task, or quarterly_assessment");
        }
        if (Number.isNaN(parsedMaxScore) || parsedMaxScore <= 0) {
            throw new BadRequestError("Max score must be a number greater than 0");
        }

        const assessmentData: AssessmentCreateProps = {
            classSubjectId: parsedClassSubjectId,
            quarter: parsedQuarter,
            type,
            title: title.trim(),
            maxScore: parsedMaxScore,
            ...(dateGiven !== undefined && dateGiven !== null && dateGiven !== "" ? { dateGiven } : {})
        };

        const assessmentId = await createAssessmentService(assessmentData);

        res.status(201).json(
            SuccessResponse({
                message: "Assessment created successfully",
                data: { assessmentId }
            })
        );
    } catch (err) {
        next(err);
    }
}

// List assessments for a class subject, optionally filtered by quarter.
export async function getAssessmentsController(req: Request, res: Response, next: NextFunction) {
    try {
        const classSubjectId = Number(req.query.classSubjectId);
        const quarterQuery = req.query.quarter;

        if (Number.isNaN(classSubjectId)) {
            throw new BadRequestError("classSubjectId query parameter is required and must be a number");
        }

        const parsedQuarter = quarterQuery !== undefined && quarterQuery !== "" ? Number(quarterQuery) : undefined;
        if (parsedQuarter !== undefined && (Number.isNaN(parsedQuarter) || parsedQuarter < 1 || parsedQuarter > 4)) {
            throw new BadRequestError("Quarter must be a number between 1 and 4");
        }

        const assessments = parsedQuarter === undefined
            ? await getAssessmentService({ classSubjectId })
            : await getAssessmentService({ classSubjectId, quarter: parsedQuarter });

        res.status(200).json(
            SuccessResponse({
                message: "Assessments retrieved successfully",
                data: assessments
            })
        );
    } catch (err) {
        next(err);
    }
}

// Update the editable fields of an assessment.
export async function updateAssessmentController(
    req: Request<{ id: number }, {}, AssessmentUpdateProps>,
    res: Response,
    next: NextFunction
) {
    try {
        const { id } = req.params;
        const { title, type, maxScore, dateGiven } = req.body;

        Validate({ id });

        const updateData: AssessmentUpdateProps = {};
        if (title !== undefined) updateData.title = title.trim();
        if (type !== undefined) {
            if (!isValidAssessmentType(type)) {
                throw new BadRequestError("Type must be written_work, performance_task, or quarterly_assessment");
            }
            updateData.type = type;
        }
        if (maxScore !== undefined) {
            const parsedMaxScore = Number(maxScore);
            if (Number.isNaN(parsedMaxScore) || parsedMaxScore <= 0) {
                throw new BadRequestError("Max score must be a number greater than 0");
            }
            updateData.maxScore = parsedMaxScore;
        }
        if (dateGiven !== undefined) {
            updateData.dateGiven = dateGiven === "" ? null : dateGiven;
        }

        await updateAssessmentService(Number(id), updateData);

        res.status(200).json(
            SuccessResponse({
                message: "Assessment updated successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}

// Delete an assessment; its student scores are removed by the DB cascade.
export async function deleteAssessmentController(req: Request<{ id: number }>, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        Validate({ id });

        await deleteAssessmentService(Number(id));

        res.status(200).json(
            SuccessResponse({
                message: "Assessment deleted successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}

// Batch-save the score sheet for one assessment: [{ enrollmentId, score }].
export async function saveAssessmentScoresController(
    req: Request<{ id: number }, {}, { scores: StudentScoreInput[] }>,
    res: Response,
    next: NextFunction
) {
    try {
        const { id } = req.params;
        const { scores } = req.body;

        Validate({ id });

        // An empty array is allowed: it clears every recorded score of the
        // assessment (the submitted sheet is treated as authoritative).
        if (!Array.isArray(scores)) {
            throw new BadRequestError("Scores must be an array of { enrollmentId, score }");
        }

        const normalizedScoreEntries = scores.map((scoreEntry) => {
            const enrollmentId = Number(scoreEntry.enrollmentId);
            const score = Number(scoreEntry.score);
            if (Number.isNaN(enrollmentId) || Number.isNaN(score)) {
                throw new BadRequestError("Each score entry must have a numeric enrollmentId and score");
            }
            return { enrollmentId, score };
        });

        await saveAssessmentScoresService(Number(id), normalizedScoreEntries);

        res.status(200).json(
            SuccessResponse({
                message: "Scores saved successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}

// Guard helper: check the assessment type is one of the three valid values.
function isValidAssessmentType(type: string): type is AssessmentType {
    return type === "written_work" || type === "performance_task" || type === "quarterly_assessment";
}
