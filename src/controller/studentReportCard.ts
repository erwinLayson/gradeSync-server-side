import type { Request, Response, NextFunction } from "express";
import { HTMLRenderer } from "../helper/HTMLRenderer.js";
import { pdfFormatter } from "../helper/pdfFormater.js";

// Service functions 
import { getStudentReportCardService } from "../service/studentsReportCard.js";
import { getSchoolSignatureService } from "../service/schoolSignature.js";
import { getSchoolLogoService } from "../service/schoolLogo.js";
import { getClassroomByIdService, getClassAdviserService } from "../service/classrooms.js";
import { getStudentByClassroomIdService } from "../service/students.js";
import { logActivityService } from "../service/activityAudit.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../constant/activityAudit.js";

// Ownership authorization (admin/developer any; faculty only their advised class)
import { assertCanAccessEnrollment, resolveTeachingFacultyId } from "../service/authorization.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../middleware/errors.js";
import { ROLES } from "../constant/users.js";

export async function studentReportCardController(req: Request<{ enrollmentId: string }>, res: Response, next: NextFunction) {
    const enrollmentId = Number(req.params.enrollmentId);

    if (req.params.enrollmentId === undefined || Number.isNaN(enrollmentId) || enrollmentId <= 0) {
        return next(new BadRequestError("Invalid enrollment ID"));
    }

    try {
        await assertCanAccessEnrollment(req.user!, enrollmentId);

        const { students, schoolInfo, subjects, generalAverages, attendance, numQuarters } =
            await getStudentReportCardService(enrollmentId);
        const [signature, logo] = await Promise.all([
            getSchoolSignatureService(),
            getSchoolLogoService(),
        ]);

        const html = HTMLRenderer("studentCard.ejs", {
            student: students,
            schoolInfo,
            subjects,
            generalAverages,
            attendance,
            signature: signature?.dataUrl ?? null,
            logo: logo?.dataUrl ?? null,
            numQuarters,
        });

        const pdfFormat = {
            width: "8.5in",
            height: "13in",
        };

        const pdf = await pdfFormatter(html, pdfFormat, true);

        // Audit log individual report card generation
        await logActivityService({
            actorUserId: req.user!.id,
            action: AUDIT_ACTIONS.REPORT_CARD_GENERATED,
            description: `Generated report card for student ${students.studentFullName} (LRN: ${students.studentLrn})`,
            entityType: AUDIT_ENTITY_TYPES.REPORT_CARD,
            entityId: String(enrollmentId),
            schoolYear: students.schoolYear || null,
            gradeLevel: Number(students.classGradeLevel) || null,
            classroomName: students.classSection ? `Grade ${students.classGradeLevel} - ${students.classSection}` : null,
            quarter: numQuarters,
            status: "success",
            metadata: {
                isBulk: false,
                enrollmentId,
                studentName: students.studentFullName,
                studentLrn: students.studentLrn,
                studentAge: students.studentAge,
                generalAverage: generalAverages.score ?? null,
            },
            ipAddress: req.ip || (req.headers["x-forwarded-for"] as string) || null,
            userAgent: req.headers["user-agent"] || null,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.status(200).send(pdf);
    } catch (err) {
        next(err);
    }
}

export async function bulkStudentReportCardController(
    req: Request<{ classId: string }>,
    res: Response,
    next: NextFunction
) {
    const classId = Number(req.params.classId);

    if (req.params.classId === undefined || Number.isNaN(classId) || classId <= 0) {
        return next(new BadRequestError("Invalid classroom ID"));
    }

    try {
        const classroom = await getClassroomByIdService(classId);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        // Ownership: Admin/developer can access any class; faculty must be the class adviser
        if (req.user!.role === ROLES.TEACHER) {
            const facultyId = await resolveTeachingFacultyId(req.user!);
            const adviser = await getClassAdviserService(classId);
            if (adviser.adviserId !== facultyId) {
                throw new ForbiddenError("You are not the class adviser for this classroom");
            }
        } else if (req.user!.role !== ROLES.ADMIN && req.user!.role !== ROLES.DEVELOPER) {
            throw new ForbiddenError("Forbidden");
        }

        const roster = await getStudentByClassroomIdService(classId);
        if (roster.length === 0) {
            throw new BadRequestError("No enrolled students found in this classroom");
        }

        const [signature, logo] = await Promise.all([
            getSchoolSignatureService(),
            getSchoolLogoService(),
        ]);

        // Render each student card separated by CSS page-break
        let combinedHtml = "";
        let numQuartersUsed = 4;

        for (let i = 0; i < roster.length; i++) {
            const studentEntry = roster[i];
            if (!studentEntry) continue;
            const { students, schoolInfo, subjects, generalAverages, attendance, numQuarters } =
                await getStudentReportCardService(studentEntry.enrollmentId);
            numQuartersUsed = numQuarters;

            const cardHtml = HTMLRenderer("studentCard.ejs", {
                student: students,
                schoolInfo,
                subjects,
                generalAverages,
                attendance,
                signature: signature?.dataUrl ?? null,
                logo: logo?.dataUrl ?? null,
                numQuarters,
            });

            // Append with page break between cards
            combinedHtml += `<div class="report-card-page" style="${i < roster.length - 1 ? 'page-break-after: always;' : ''}">${cardHtml}</div>`;
        }

        const pdfFormat = {
            width: "8.5in",
            height: "13in",
        };

        const pdf = await pdfFormatter(combinedHtml, pdfFormat, true);

        // Audit log bulk report card generation
        await logActivityService({
            actorUserId: req.user!.id,
            action: AUDIT_ACTIONS.REPORT_CARD_GENERATED,
            description: `Generated bulk report cards for classroom "${classroom.section}" (${roster.length} students)`,
            entityType: AUDIT_ENTITY_TYPES.REPORT_CARD,
            entityId: String(classId),
            classroomId: classId,
            gradeLevel: classroom.gradeLevel,
            classroomName: `Grade ${classroom.gradeLevel} - ${classroom.section}`,
            quarter: numQuartersUsed,
            status: "success",
            metadata: {
                isBulk: true,
                classId,
                totalStudents: roster.length,
                studentEnrollmentIds: roster.map((s) => s.enrollmentId),
            },
            ipAddress: req.ip || (req.headers["x-forwarded-for"] as string) || null,
            userAgent: req.headers["user-agent"] || null,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.status(200).send(pdf);
    } catch (err) {
        next(err);
    }
}
