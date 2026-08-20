import type{ Request, Response, NextFunction } from 'express';

import {activateSchoolYearService, getSchoolYearService, createSchoolYearService} from '../service/schoolYear.js';
import { SuccessResponse } from '../helper/response.js';
import Validate from '../helper/validate.js';
import { BadRequestError } from '../middleware/errors.js';


export async function getSchoolYearController(req: Request, res: Response, next: NextFunction) {
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

export async function createSchoolYearController(req: Request, res: Response, next: NextFunction) {
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