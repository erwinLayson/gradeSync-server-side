import type { Response, Request, NextFunction } from "express";

import { getMyClassesService, getStudentProspectusService, getStudentAcademicHistoryService, getStudentClassAttendanceService } from "../service/studentClasses.js";

// Helpers
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

// GET /students/classes — the logged-in student's classes with grades.
export async function getMyClassesController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("Missing user context");
        }

        const result = await getMyClassesService(userId);

        return res.status(200).json(
            SuccessResponse({
                message: "Classes retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /students/prospectus — the logged-in student's academic prospectus
// (frozen-record-only view: official grades, no live activities/attendance).
export async function getStudentProspectusController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("Missing user context");
        }

        const result = await getStudentProspectusService(userId);

        return res.status(200).json(
            SuccessResponse({
                message: "Prospectus retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /students/attendance — the logged-in student's class-level attendance
// from class_daily_attendance (adviser records, report-card source).
export async function getStudentClassAttendanceController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("Missing user context");
        }

        const quarter = req.query.quarter ? Number(req.query.quarter) : undefined;
        const result = await getStudentClassAttendanceService(userId, quarter);

        return res.status(200).json(
            SuccessResponse({
                message: "Class attendance retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /students/:id/academic-history — an admin/teacher view of one student's
// academic history (all enrolled school years) with grades and attendance.
export async function getStudentAcademicHistoryController(
    req: Request<{ id: number }>,
    res: Response,
    next: NextFunction
) {
    try {
        const { id } = req.params;
        const studentId = Number(id);
        if (Number.isNaN(studentId) || !Number.isInteger(studentId) || studentId <= 0) {
            throw new BadRequestError("Invalid student id");
        }

        const result = await getStudentAcademicHistoryService(studentId);

        return res.status(200).json(
            SuccessResponse({
                message: "Academic history retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}
