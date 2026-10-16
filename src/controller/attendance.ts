import type { Request, Response, NextFunction } from "express";

import {
    getAttendanceByClassSubjectAndDateService,
    getAttendanceHistoryService,
    getAttendanceRangeService,
    saveAttendanceByClassSubjectAndDateService,
} from "../service/studentAttendance.js";
import { getNumQuarters } from "../service/academicSettings.js";
import { assertFacultyOwnsClassSubject, resolveActorFacultyId } from "../service/authorization.js";
import { isValidQuarter } from "../helper/quarterValidation.js";

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

        // Ownership: only the faculty assigned to this class subject (or an
        // admin) may read its attendance.
        const facultyId = await resolveActorFacultyId(req.user!);
        await assertFacultyOwnsClassSubject(facultyId, classSubjectId);

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

// GET /api/attendance/range?classSubjectId=&schoolYearId=&quarter=&dateFrom=&dateTo=
// The class-wide attendance matrix that powers the faculty's spreadsheet view:
// the class roster (rows), every recorded date in the selected slice (columns)
// and the cells in between. All filters are optional and combine; the columns
// are derived from the returned rows, so a column can never be a date with no
// matching record.
export async function getAttendanceRangeController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = Number(req.query.classSubjectId);
        if (Number.isNaN(classSubjectId)) {
            throw new BadRequestError(
                "classSubjectId query parameter is required and must be a number"
            );
        }

        // Optional school year filter (resolved through the enrollment).
        const schoolYearRaw = req.query.schoolYearId;
        let parsedSchoolYearId: number | undefined;
        if (schoolYearRaw !== undefined && schoolYearRaw !== "") {
            parsedSchoolYearId = Number(schoolYearRaw);
            if (Number.isNaN(parsedSchoolYearId) || !Number.isInteger(parsedSchoolYearId)) {
                throw new BadRequestError("schoolYearId query parameter must be a number");
            }
        }

        // Optional quarter filter (1-numQuarters). Absent/empty = all quarters.
        const quarterRaw = req.query.quarter;
        let parsedQuarter: number | undefined;
        if (quarterRaw !== undefined && quarterRaw !== "") {
            parsedQuarter = Number(quarterRaw);
            const numQuarters = await getNumQuarters();
            if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
                throw new BadRequestError(
                    `quarter query parameter must be a number between 1 and ${numQuarters}`
                );
            }
        }

        // Optional date range (inclusive). Bounds are validated in the service.
        const dateFrom = req.query.dateFrom === undefined || req.query.dateFrom === ""
            ? undefined
            : String(req.query.dateFrom);
        const dateTo = req.query.dateTo === undefined || req.query.dateTo === ""
            ? undefined
            : String(req.query.dateTo);

        // Ownership: only the assigned faculty (or an admin) may read a class
        // subject's attendance, matching the other attendance reads.
        const facultyId = await resolveActorFacultyId(req.user!);
        await assertFacultyOwnsClassSubject(facultyId, classSubjectId);

        const matrix = await getAttendanceRangeService(classSubjectId, {
            schoolYearId: parsedSchoolYearId,
            quarter: parsedQuarter,
            dateFrom,
            dateTo,
        });

        res.status(200).json(
            SuccessResponse({
                message: "Attendance range retrieved successfully",
                data: matrix,
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

        // Optional quarter filter (1-numQuarters). Absent/empty = all quarters.
        const quarterRaw = req.query.quarter;
        let parsedQuarter: number | undefined;
        if (quarterRaw !== undefined && quarterRaw !== "") {
            parsedQuarter = Number(quarterRaw);
            const numQuarters = await getNumQuarters();
            if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
                throw new BadRequestError(
                    `quarter query parameter must be a number between 1 and ${numQuarters}`
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

        // Ownership: only the assigned faculty (or an admin) may read a
        // student's attendance history for this class subject.
        const facultyId = await resolveActorFacultyId(req.user!);
        await assertFacultyOwnsClassSubject(facultyId, classSubjectId);

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
// classSubjectId+enrollment+date). The faculty-chosen quarter (1-4) is stored
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
        const numQuarters = await getNumQuarters();
        if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
            throw new BadRequestError(`quarter is required and must be a number between 1 and ${numQuarters}`);
        }
        if (!Array.isArray(entries)) {
            throw new BadRequestError("entries must be an array of { enrollmentId, status }");
        }

        // Ownership: only the faculty assigned to this class subject (or an
        // admin) may save attendance for it. (facultyUserId below is a USER id
        // used for adviser detection; this is the TEACHER id used for ownership.)
        const actorFacultyId = await resolveActorFacultyId(req.user!);
        await assertFacultyOwnsClassSubject(actorFacultyId, parsedClassSubjectId);

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

        // Resolve the authenticated faculty's userId so the service can check
        // whether this faculty is the class adviser (adviser attendance is saved
        // to both student_attendance AND class_daily_attendance).
        const facultyUserId = req.user?.id ?? null;

        await saveAttendanceByClassSubjectAndDateService(
            parsedClassSubjectId,
            date,
            normalizedEntries,
            parsedQuarter,
            facultyUserId,
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
