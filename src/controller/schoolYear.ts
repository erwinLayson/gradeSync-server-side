import type{ Request, Response, NextFunction } from 'express';

import {activateSchoolYearService, getSchoolYearService, createSchoolYearService, setSchoolYearStatusService} from '../service/schoolYear.js';
import { SuccessResponse } from '../helper/response.js';
import Validate from '../helper/validate.js';
import { BadRequestError } from '../middleware/errors.js';
import { isSchoolYearStatus, SCHOOL_YEAR_STATUSES } from '../constant/schoolYear.js';


export async function getSchoolYearController(_req: Request, res: Response, next: NextFunction) {
    try {
        const schoolYear = await getSchoolYearService();
        res.status(200).json(
            SuccessResponse({
                message: "Successfully retrieved school year data",
                data: schoolYear
            })
        );
    }catch(err) {
        next(err);
    }

}

export async function createSchoolYearController(_req: Request, res: Response, next: NextFunction) {
    try {
        const schoolYear = await createSchoolYearService();
        res.status(201).json(
            SuccessResponse({
                message: "School year created successfully",
                data: schoolYear
            })
        );
    }catch(err) {
        next(err);
    }
}

// PATCH /schoolYear/:id/activate — make one school year the single active one.
export async function activateSchoolYearController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        Validate({ id });

        const parsedId = Number(id);
        if (Number.isNaN(parsedId)) {
            throw new BadRequestError("Invalid school year id");
        }

        const schoolYears = await activateSchoolYearService(parsedId);
        res.status(200).json(
            SuccessResponse({
                message: "School year activated successfully",
                data: schoolYears
            })
        );
    }catch(err) {
        next(err);
    }
}

// PATCH /schoolYear/:id/status  { status: 'ongoing' | 'completed' }
// The OFFICIAL school-year completion switch: faculty role changes are allowed
// only while the governing year reads 'completed' (plan §7). Admin-only.
export async function setSchoolYearStatusController(req: Request<{id: number}, {}, {status: string}>, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        Validate({ id, status });

        const parsedId = Number(id);
        if (Number.isNaN(parsedId)) {
            throw new BadRequestError("Invalid school year id");
        }
        if (!isSchoolYearStatus(status)) {
            throw new BadRequestError(`"status" must be one of: ${SCHOOL_YEAR_STATUSES.join(", ")}`);
        }

        const result = await setSchoolYearStatusService(parsedId, status);
        const message = status === "completed"
            ? (result.totalCleared > 0
                ? `School year marked as completed. ${result.totalCleared} student(s) cleared from ${result.classroomsCleared} classroom(s).`
                : "School year marked as completed")
            : "School year reopened";

        res.status(200).json(
            SuccessResponse({
                message,
                data: result.schoolYears
            })
        );
    }catch(err) {
        next(err);
    }
}