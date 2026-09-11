import type { Response, Request, NextFunction } from "express";
import type { RowDataPacket } from "mysql2/promise";
import type { EnrollmentCreateProps } from "../constant/enrollments.js";

import { createEnrollmentService, bulkRemoveStudentsFromClassService, clearAllFromClassService, clearAllClassroomsService } from "../service/enrollments.js";
import Enrollments from "../model/enrollments.js";
import { getDBPoolConnection } from "../config/database.js";

// Helpers
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";


export async function createEnrollmentController(
    req: Request<{}, {}, EnrollmentCreateProps>,
    res: Response,
    next: NextFunction
) {
    const { studentId, classId, schoolYearId, subjectIds } = req.body;
    try {
        const enrollment = {
            studentId: Number(studentId),
            classId: Number(classId),
            schoolYearId: Number(schoolYearId),
            subjectIds: Array.isArray(subjectIds) ? subjectIds.map((id) => Number(id)) : []
        };

        // Validate enrollment data
        Validate(enrollment);

        await createEnrollmentService(enrollment);

        return res.status(201).json(
            SuccessResponse({
                message: "Student enrolled successfully"
            })
        );
    } catch (err) {
        next(err);
    }
}

// Bulk-remove students from a classroom
export async function bulkRemoveEnrollmentsController(
    req: Request<{ classId: string }, {}, { enrollmentIds: number[] }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classId = Number(req.params.classId);
        const { enrollmentIds } = req.body;

        if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
            return res.status(400).json(
                SuccessResponse({ message: "enrollmentIds must be a non-empty array" })
            );
        }

        const removedIds = await bulkRemoveStudentsFromClassService(
            classId,
            enrollmentIds.map((id) => Number(id))
        );

        return res.status(200).json(
            SuccessResponse({
                message: `${removedIds.length} student(s) removed from classroom`,
                data: { removedIds }
            })
        );
    } catch (err) {
        next(err);
    }
}

// Count active enrollments in the active school year
export async function countActiveEnrollmentsController(
    _req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const pool = getDBPoolConnection();
        const connection = await pool.getConnection();
        try {
            const [yearRows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1"
            );
            const schoolYearId = yearRows[0]?.id;
            if (!schoolYearId) {
                return res.status(200).json(
                    SuccessResponse({ message: "No active school year", data: { count: 0 } })
                );
            }
            const enrollmentModel = new Enrollments(connection);
            const count = await enrollmentModel.countActiveEnrollments(schoolYearId);
            return res.status(200).json(
                SuccessResponse({ message: "Retrieved", data: { count } })
            );
        } finally {
            connection.release();
        }
    } catch (err) {
        next(err);
    }
}

// Clear all students from a single classroom
export async function clearAllFromClassController(
    req: Request<{ classId: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classId = Number(req.params.classId);
        if (!Number.isInteger(classId) || classId <= 0) {
            return res.status(400).json(SuccessResponse({ message: "Invalid class ID" }));
        }

        const cleared = await clearAllFromClassService(classId);

        return res.status(200).json(
            SuccessResponse({
                message: `${cleared} student(s) cleared from classroom`,
                data: { cleared }
            })
        );
    } catch (err) {
        next(err);
    }
}

// Clear all students from ALL active classrooms
export async function clearAllClassroomsController(
    _req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const result = await clearAllClassroomsService();

        return res.status(200).json(
            SuccessResponse({
                message: `${result.totalCleared} student(s) cleared from ${result.classroomsCleared} classroom(s)`,
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}
