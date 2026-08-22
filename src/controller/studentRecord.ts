import type { NextFunction, Request, Response } from "express";
import ejs from "ejs";
import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "puppeteer";

import {
    getAdvisedClassIdService,
    getClassRecordsService,
    getSubmissionSummaryService,
    reopenStudentRecordService,
    resolveTeacherIdByUserIdService,
    submitAllStudentRecordsService,
    submitStudentRecordService,
    StudentRecordPDFDetailsService
} from "../service/studentRecord.js";

import { getSchoolInfoService } from "../service/schoolInfo.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";
import { ROLES } from "../constant/users.js";
import { HTMLRenderer } from "../helper/HTMLRenderer.js";
import { pdfFormatter } from "../helper/pdfFormater.js";

// ==================== param helpers ====================

function parseIdParam(value: string, name: string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestError(`Invalid ${name}`);
    }
    return id;
}

function parseQuarterParam(value: unknown): number {
    const quarter = Number(value);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        throw new BadRequestError("quarter must be an integer between 1 and 4");
    }
    return quarter;
}

// The acting teacher's id for ownership checks; null when the caller is an admin.
async function resolveActorTeacherId(req: Request): Promise<number | null> {
    if (req.user?.role === ROLES.ADMIN) {
        return null;
    }
    return resolveTeacherIdByUserIdService(req.user!.id);
}

// ==================== GET /api/student-records/my-class ====================

export async function getMyClassRecordsController(req: Request, res: Response, next: NextFunction) {
    try {
        const quarter = parseQuarterParam(req.query.quarter ?? 1);
        const teacherId = await resolveActorTeacherId(req);
        const classId = await getAdvisedClassIdService(teacherId!);

        if(classId) {
            const result = await getClassRecordsService(classId, quarter, teacherId);
            return res.status(200).json(
                SuccessResponse({
                    message: "Retrieved successfully",
                    data: result
                })
            );
        }

        res.json(
            SuccessResponse({
                message: "Retrieved successfully",
            })
        )
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/class/:classId ====================

export async function getClassRecordsController(req: Request<{ classId: string }>, res: Response, next: NextFunction) {
    try {
        const classId = parseIdParam(req.params.classId, "classId");
        const quarter = parseQuarterParam(req.query.quarter ?? 1);
        const teacherId = await resolveActorTeacherId(req);
        const result = await getClassRecordsService(classId, quarter, teacherId);
        return res.status(200).json(
            SuccessResponse({
                message: "Retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST .../students/:enrollmentId/quarter/:quarter/submit ====================

export async function submitStudentRecordController(
    req: Request<{ classId: string; enrollmentId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classId = parseIdParam(req.params.classId, "classId");
        const enrollmentId = parseIdParam(req.params.enrollmentId, "enrollmentId");
        const quarter = parseQuarterParam(req.params.quarter);
        const teacherId = await resolveActorTeacherId(req);
        const result = await submitStudentRecordService(classId, enrollmentId, quarter, teacherId);
        return res.status(200).json(
            SuccessResponse({
                message: "Student record submitted successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST .../quarter/:quarter/submit-all ====================

export async function submitAllStudentRecordsController(
    req: Request<{ classId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classId = parseIdParam(req.params.classId, "classId");
        const quarter = parseQuarterParam(req.params.quarter);
        const teacherId = await resolveActorTeacherId(req);
        const result = await submitAllStudentRecordsService(classId, quarter, teacherId);
        return res.status(200).json(
            SuccessResponse({
                message: "Student records submitted",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST .../students/:enrollmentId/quarter/:quarter/reopen ====================

export async function reopenStudentRecordController(
    req: Request<{ classId: string; enrollmentId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classId = parseIdParam(req.params.classId, "classId");
        const enrollmentId = parseIdParam(req.params.enrollmentId, "enrollmentId");
        const quarter = parseQuarterParam(req.params.quarter);
        const teacherId = await resolveActorTeacherId(req);
        const result = await reopenStudentRecordService(classId, enrollmentId, quarter, teacherId);
        return res.status(200).json(
            SuccessResponse({
                message: "Student record reopened",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/summary (admin) ====================

export async function getSubmissionSummaryController(req: Request, res: Response, next: NextFunction) {
    try {
        const rawSchoolYearId = req.query.schoolYearId;
        const schoolYearId = rawSchoolYearId !== undefined ? Number(rawSchoolYearId) : undefined;
        const result = await getSubmissionSummaryService(Number.isNaN(schoolYearId) ? undefined : schoolYearId);
        return res.status(200).json(
            SuccessResponse({
                message: "Retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/:id/pdf ====================

export async function studentRecordController(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const {id} = req.params;
        const { student, academicRecord } = await StudentRecordPDFDetailsService(Number(id));
        const schoolInfo = await getSchoolInfoService();

        //  ===================== School Year Data ======================
        const {semester1, semester2} = academicRecord;
        const schoolYearLenght = [...semester1, ...semester2];
        const lastSchoolYearAttended = schoolYearLenght[schoolYearLenght.length - 1];


        // ==================== Student Record Certification Data =================
        const certification = {
            studentName: `${student.firstname} ${student.middlename} ${student.lastname} ${student.suffix ?? ""}`,
            studentLrn: student.lrn,
            admission_to: 7,
            schoolName: schoolInfo?.name,
            schoolId: schoolInfo?.schoolId,
            date: new Intl.DateTimeFormat("en-US", {month: "2-digit", day: "2-digit", year: "2-digit"}).format(new Date()),
            schoolPrincipal: schoolInfo?.principal,
            lastSchoolYear: lastSchoolYearAttended?.schoolYear
        }

        // =================== DATA SEND TO EJS FILE  TO RENDER STUDENT DATA ====================
        const data = { 
            student, 
            scholastic: {
                semester1,
                semester2
            }, 
            schoolInfo, 
            certification 
        }

        // ==================  PDF FORMAT ==================
        const studentRecordFormat = {
            width: '8.5in',
            height: '13in'
        }

        // ================== HTML AND PDF =====================
        const html = HTMLRenderer('studentRecord.ejs', data)
        const studentRecordPDF = await pdfFormatter(html, studentRecordFormat, false)

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="student-record-${id}.pdf"`);
        res.send(studentRecordPDF);
    } catch (err) {
        next(err);
    }
}