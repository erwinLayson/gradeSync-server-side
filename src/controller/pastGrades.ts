import type { Response, Request, NextFunction } from "express";

import { getPastSubmittedGradesService } from "../service/pastGrades.js";
import { NotFoundError, BadRequestError } from "../middleware/errors.js";
import { SuccessResponse } from "../helper/response.js";

export async function getPastSubmittedGradesController(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    const { id } = req.params;
    const studentId = Number(id);

    if (Number.isNaN(studentId) || !Number.isInteger(studentId) || studentId <= 0) {
        return next(new BadRequestError("Invalid student id"));
    }

    try {
        const result = await getPastSubmittedGradesService(studentId);

        if (result.classes.length === 0) {
            return res.status(200).json(
                SuccessResponse({
                    message: "No past submitted grades found",
                    data: result,
                })
            );
        }

        return res.status(200).json(
            SuccessResponse({
                message: "Past submitted grades retrieved",
                data: result,
            })
        );
    } catch (err) {
        if (err instanceof NotFoundError) {
            return next(err);
        }
        next(err);
    }
}
