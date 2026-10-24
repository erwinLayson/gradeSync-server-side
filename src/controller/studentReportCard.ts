import type{Request, Response, NextFunction} from "express";
import { HTMLRenderer } from "../helper/HTMLRenderer.js";
import { pdfFormatter } from "../helper/pdfFormater.js";

// Service functions 
import {getStudentReportCardService} from "../service/studentsReportCard.js";
import { getSchoolSignatureService } from "../service/schoolSignature.js";
import { getSchoolLogoService } from "../service/schoolLogo.js";

// Ownership authorization (admin/developer any; faculty only their advised class)
import { assertCanAccessEnrollment } from "../service/authorization.js";
import { BadRequestError } from "../middleware/errors.js";

export async function studentReportCardController(req: Request<{enrollmentId: string}>, res: Response, next: NextFunction)  {
    const enrollmentId = Number(req.params.enrollmentId);

    if(req.params.enrollmentId === undefined || Number.isNaN(enrollmentId) || enrollmentId <= 0) {
        return next(new BadRequestError("Invalid enrollment ID"))
    }

    try {
        // Authorization before any data is read or rendered: an authenticated
        // caller must not be able to fetch an arbitrary student's report card by
        // changing the enrollmentId. 403 when authenticated but not entitled.
        await assertCanAccessEnrollment(req.user!, enrollmentId);

        const {students, schoolInfo, subjects, generalAverages, attendance, numQuarters} = await getStudentReportCardService(enrollmentId)
        const [signature, logo] = await Promise.all([
            getSchoolSignatureService(),
            getSchoolLogoService(),
        ])

        console.log(attendance)
        const html = HTMLRenderer("studentCard.ejs", {student: students, schoolInfo, subjects, generalAverages, attendance, signature: signature?.dataUrl ?? null, logo: logo?.dataUrl ?? null, numQuarters});
        const pdfFormat = {
            width: '8.5in',
            height: '13in',
        }

        const pdf = await pdfFormatter(html, pdfFormat, true)

        res.setHeader("Content-Type", "application/pdf")
        res.status(200).send(pdf)
    }catch(err) {
        next(err)
    }
}