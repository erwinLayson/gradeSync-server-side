import type { Response, Request, NextFunction } from "express";
import type { EnrollmentCreateProps } from "../constant/enrollments.js";

import { createEnrollmentService, removeStudentFromClassService, bulkRemoveStudentsFromClassService } from "../service/enrollments.js";

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
