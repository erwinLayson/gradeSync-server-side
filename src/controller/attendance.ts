import type { Request, Response, NextFunction } from "express";

import {
    getAttendanceByClassSubjectAndDateService,
    getAttendanceHistoryService,
    saveAttendanceByClassSubjectAndDateService,
} from "../service/studentAttendance.js";

import type { AttendanceInput } from "../constant/grade.js";

import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

// GET /api/attendance?classSubjectId=:classSubjectId&date=YYYY-MM-DD
// Returns every attendance record for the subject on that date (only students
// with a record; the client fills the rest in as unmarked/present).
export async function getAttendanceByClassSubjectAndDateController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = Number(req.query.classSubjectId);
        const date = String(req.query.date ?? "");

        if (Number.isNaN(classSubjectId)) {
            throw new BadRequestError(
                "classSubjectId query parameter is required and must be a number"
            );
        }
        if (!date) {
            throw new BadRequestError("date query parameter is required (YYYY-MM-DD)");
        }

        const attendance = await getAttendanceByClassSubjectAndDateService(classSubjectId, date);

        res.status(200).json(
            SuccessResponse({
                message: "Attendance retrieved successfully",
                data: attendance,
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/attendance/:enrollmentId/history?classSubjectId=:classSubjectId&quarter=1&schoolYearId=3
// Returns one student's full attendance history for one subject with a summary.
// The optional quarter (1-4) and schoolYearId query parameters scope both the
// records and the summary to that slice of the school year.
export async function getAttendanceHistoryController(
    req: Request<{ enrollmentId: number }>,
    res: Response,
    next: NextFunction
) {
    try {
        const { enrollmentId } = req.params;
        const classSubjectId = Number(req.query.classSubjectId);

        const parsedEnrollmentId = Number(enrollmentId);
        if (Number.isNaN(parsedEnrollmentId)) {
            throw new BadRequestError("enrollmentId must be a number");
        }
        if (Number.isNaN(classSubjectId)) {
            throw new BadRequestError(
                "classSubjectId query parameter is required and must be a number"
            );
        }

        // Optional quarter filter (1-4). Absent/empty = all quarters.
        const quarterRaw = req.query.quarter;
        let parsedQuarter: number | undefined;
        if (quarterRaw !== undefined && quarterRaw !== "") {
            parsedQuarter = Number(quarterRaw);
            if (Number.isNaN(parsedQuarter) || parsedQuarter < 1 || parsedQuarter > 4) {
                throw new BadRequestError(
                    "quarter query parameter must be a number between 1 and 4"
                );
            }
        }

        // Optional school year filter (resolved via the enrollment). Absent = all years.
        const schoolYearRaw = req.query.schoolYearId;
        let parsedSchoolYearId: number | undefined;
        if (schoolYearRaw !== undefined && schoolYearRaw !== "") {
            parsedSchoolYearId = Number(schoolYearRaw);
            if (Number.isNaN(parsedSchoolYearId) || !Number.isInteger(parsedSchoolYearId)) {
                throw new BadRequestError("schoolYearId query parameter must be a number");
            }
        }

        const history = await getAttendanceHistoryService(
            classSubjectId,
            parsedEnrollmentId,
            parsedQuarter,
            parsedSchoolYearId,
        );

        res.status(200).json(
            SuccessResponse({
                message: "Attendance history retrieved successfully",
                data: history,
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/attendance
// Body: { classSubjectId, date, quarter, entries: [{ enrollmentId, status }] }
// Idempotently saves one day of attendance for the subject (upsert per
// classSubjectId+enrollment+date). The teacher-chosen quarter (1-4) is stored
// with every row of the day so history can be filtered per quarter.
export async function saveAttendanceController(
    req: Request<
        {},
        {},
        { classSubjectId: number; date: string; quarter: number; entries: AttendanceInput[] }
    >,
    res: Response,
    next: NextFunction
) {
    try {
        const { classSubjectId, date, quarter, entries } = req.body;

        const parsedClassSubjectId = Number(classSubjectId);
        if (Number.isNaN(parsedClassSubjectId)) {
            throw new BadRequestError("classSubjectId is required and must be a number");
        }
        if (typeof date !== "string" || !date) {
            throw new BadRequestError("date is required (YYYY-MM-DD)");
        }
        const parsedQuarter = Number(quarter);
        if (Number.isNaN(parsedQuarter) || parsedQuarter < 1 || parsedQuarter > 4) {
            throw new BadRequestError("quarter is required and must be a number between 1 and 4");
        }
        if (!Array.isArray(entries)) {
            throw new BadRequestError("entries must be an array of { enrollmentId, status }");
        }

        const normalizedEntries: AttendanceInput[] = entries.map((entry) => {
            const enrollmentId = Number(entry?.enrollmentId);
            const status = entry?.status;
            if (Number.isNaN(enrollmentId)) {
                throw new BadRequestError("Each entry must have a numeric enrollmentId");
            }
            if (status !== "present" && status !== "absent") {
                throw new BadRequestError("Each entry status must be 'present' or 'absent'");
            }
            return { enrollmentId, status };
        });

        // Resolve the authenticated teacher's userId so the service can check
        // whether this teacher is the class adviser (adviser attendance is saved
        // to both student_attendance AND class_daily_attendance).
        const teacherUserId = req.user?.id ?? null;

        await saveAttendanceByClassSubjectAndDateService(
            parsedClassSubjectId,
            date,
            normalizedEntries,
            parsedQuarter,
            teacherUserId,
        );

        res.status(200).json(
            SuccessResponse({
                message: "Attendance saved successfully",
            })
        );
    } catch (err) {
        next(err);
    }
}
