import type{Request, Response, NextFunction} from "express";
import { HTMLRenderer } from "../helper/HTMLRenderer.js";
import { pdfFormatter } from "../helper/pdfFormater.js";

// Service functions 
import {getStudentsController} from "../service/studentsReportCard.js";

export async function studentReportCardController(req: Request<{enrollmentId: number}>, res: Response, next: NextFunction)  {
    const {enrollmentId} = req.params;

    if(!enrollmentId || isNaN(enrollmentId)) {
        throw new Error("Invalid ID")
    }

    try {
        const {students, schoolInfo, subjects, generalAverages} = await getStudentsController(enrollmentId)

        const html = HTMLRenderer("studentCard.ejs", {student: students, schoolInfo, subjects, generalAverages});
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