import type { NextFunction, Request, Response } from "express";
import {
    getAdvisedClassIdService,
    getClassRecordsService,
    getSubmissionSummaryService,
    reopenStudentRecordService,
    resolveFacultyIdByUserIdService,
    submitAllStudentRecordsService,
    submitStudentRecordService,
    StudentRecordPDFDetailsService,
    getTeacherAssignedSubjectsService,
    getSubjectClassRecordsService,
    submitSubjectRecordsService,
    submitSingleStudentSubjectRecordService,
    reopenSubjectRecordService,
    getSubjectSubmissionSummaryService,
    getSubjectStudentAmendDataService
} from "../service/studentRecord.js";

import { getSchoolInfoService } from "../service/schoolInfo.js";
import { getSchoolSignatureService } from "../service/schoolSignature.js";
import { getAcademicSettingsService } from "../service/academicSettings.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";
import { isValidQuarter } from "../helper/quarterValidation.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";
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

async function parseQuarterParam(value: unknown): Promise<number> {
    const quarter = Number(value);
    const settings = await getAcademicSettingsService();
    const numQuarters = settings?.numQuarters ?? 4;
    if (!isValidQuarter(quarter, numQuarters)) {
        throw new BadRequestError(`quarter must be an integer between 1 and ${numQuarters}`);
    }
    return quarter;
}

// The acting faculty's id for ownership checks; null when the caller is an admin or register.
async function resolveActorFacultyId(req: Request): Promise<number | null> {
    if (req.user?.role === ROLES.ADMIN) {
        return null;
    }
    if (req.faculty?.role === FACULTY_ROLES.REGISTER || req.user?.facultyRole === FACULTY_ROLES.REGISTER) {
        return null;
    }
    return resolveFacultyIdByUserIdService(req.user!.id);
}

// ==================== GET /api/student-records/my-class ====================

export async function getMyClassRecordsController(req: Request, res: Response, next: NextFunction) {
    try {
        const quarter = await parseQuarterParam(req.query.quarter ?? 1);
        const facultyId = await resolveActorFacultyId(req);
        const classId = await getAdvisedClassIdService(facultyId!);

        if(classId) {
            const result = await getClassRecordsService(classId, quarter, facultyId);
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
        const quarter = await parseQuarterParam(req.query.quarter ?? 1);
        const facultyId = await resolveActorFacultyId(req);
        const result = await getClassRecordsService(classId, quarter, facultyId);
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
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await submitStudentRecordService(classId, enrollmentId, quarter, facultyId, req.user);
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
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await submitAllStudentRecordsService(classId, quarter, facultyId, req.user);
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
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await reopenStudentRecordService(classId, enrollmentId, quarter, facultyId);
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

// ==================== GET /api/student-records/my-subjects ====================

export async function getTeacherAssignedSubjectsController(req: Request, res: Response, next: NextFunction) {
    try {
        const facultyId = await resolveActorFacultyId(req);
        if (!facultyId) {
            return res.status(200).json(
                SuccessResponse({
                    message: "No assigned subjects found",
                    data: []
                })
            );
        }
        const result = await getTeacherAssignedSubjectsService(facultyId);
        return res.status(200).json(
            SuccessResponse({
                message: "Assigned subjects retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/class-subjects/:classSubjectId ====================

export async function getSubjectClassRecordsController(
    req: Request<{ classSubjectId: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = parseIdParam(req.params.classSubjectId, "classSubjectId");
        const quarter = await parseQuarterParam(req.query.quarter ?? 1);
        const facultyId = await resolveActorFacultyId(req);
        const result = await getSubjectClassRecordsService(classSubjectId, quarter, facultyId);
        return res.status(200).json(
            SuccessResponse({
                message: "Subject class records retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST /api/student-records/class-subjects/:classSubjectId/quarter/:quarter/submit ====================

export async function submitSubjectRecordsController(
    req: Request<{ classSubjectId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = parseIdParam(req.params.classSubjectId, "classSubjectId");
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await submitSubjectRecordsService(classSubjectId, quarter, facultyId, req.user);
        return res.status(200).json(
            SuccessResponse({
                message: "Subject records submitted successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST /api/student-records/class-subjects/:classSubjectId/students/:enrollmentId/quarter/:quarter/submit ====================

export async function submitSingleStudentSubjectRecordController(
    req: Request<{ classSubjectId: string; enrollmentId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = parseIdParam(req.params.classSubjectId, "classSubjectId");
        const enrollmentId = parseIdParam(req.params.enrollmentId, "enrollmentId");
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await submitSingleStudentSubjectRecordService(classSubjectId, enrollmentId, quarter, facultyId, req.user);
        return res.status(200).json(
            SuccessResponse({
                message: "Student subject record submitted successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== POST /api/student-records/class-subjects/:classSubjectId/quarter/:quarter/reopen ====================

export async function reopenSubjectRecordController(
    req: Request<{ classSubjectId: string; quarter: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = parseIdParam(req.params.classSubjectId, "classSubjectId");
        const quarter = await parseQuarterParam(req.params.quarter);
        const facultyId = await resolveActorFacultyId(req);
        const result = await reopenSubjectRecordService(classSubjectId, quarter, facultyId, req.user);
        return res.status(200).json(
            SuccessResponse({
                message: "Subject record reopened successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/subject-summary ====================

export async function getSubjectSubmissionSummaryController(req: Request, res: Response, next: NextFunction) {
    try {
        const rawSchoolYearId = req.query.schoolYearId;
        const schoolYearId = rawSchoolYearId !== undefined ? Number(rawSchoolYearId) : undefined;
        const result = await getSubjectSubmissionSummaryService(Number.isNaN(schoolYearId) ? undefined : schoolYearId);
        return res.status(200).json(
            SuccessResponse({
                message: "Subject submission summary retrieved successfully",
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
        const rawEnrollmentIds = req.query.enrollmentIds;
        let enrollmentIds: number[] | undefined;
        if (typeof rawEnrollmentIds === "string") {
            enrollmentIds = rawEnrollmentIds
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isInteger(n) && n > 0);
        } else if (Array.isArray(rawEnrollmentIds)) {
            enrollmentIds = rawEnrollmentIds
                .map((s) => Number(String(s).trim()))
                .filter((n) => Number.isInteger(n) && n > 0);
        }

        const { student, academicRecord, numQuarters } = await StudentRecordPDFDetailsService(
            Number(id),
            enrollmentIds && enrollmentIds.length > 0 ? { enrollmentIds } : undefined
        );
        const schoolInfo = await getSchoolInfoService();
        const signature = await getSchoolSignatureService();

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
            lastSchoolYear: lastSchoolYearAttended?.schoolYear ?? ""
        }

        // =================== DATA SEND TO EJS FILE  TO RENDER STUDENT DATA ====================
        const data = { 
            student, 
            scholastic: {
                semester1,
                semester2
            }, 
            schoolInfo, 
            certification,
            signature: signature?.dataUrl ?? null,
            numQuarters 
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
        res.status(200).send(studentRecordPDF);
    } catch (err) {
        next(err);
    }
}

// ==================== GET /api/student-records/subject-classes/:classSubjectId/students/:enrollmentId/amend-data ====================

export async function getSubjectStudentAmendDataController(
    req: Request<{ classSubjectId: string; enrollmentId: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const classSubjectId = parseIdParam(req.params.classSubjectId, "classSubjectId");
        const enrollmentId = parseIdParam(req.params.enrollmentId, "enrollmentId");
        const quarter = await parseQuarterParam(req.query.quarter ?? 1);
        const facultyId = await resolveActorFacultyId(req);
        const data = await getSubjectStudentAmendDataService(classSubjectId, enrollmentId, quarter, facultyId);
        return res.status(200).json(
            SuccessResponse({
                message: "Student amendment data retrieved successfully",
                data
            })
        );
    } catch (err) {
        next(err);
    }
}