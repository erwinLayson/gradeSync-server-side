import type { Response, Request, NextFunction } from "express";
import {
    getGradeBookDetailsByClassSubjectIdService
} from "../service/gradebook.js";
import { assertTeacherOwnsClassSubject, resolveActorTeacherId } from "../service/authorization.js";
import Validate from "../helper/validate.js";
import { SuccessResponse } from "../helper/response.js";


export async function getGradeBookDetailsByClassSubjectIdController(req: Request<{classSubjectId: number}>, res: Response, next: NextFunction) {
    const {classSubjectId} = req.params;
    // Number(undefined) is NaN, and ?? does not catch NaN — fall back explicitly
    const parsedQuarter = Number(req.query.quarter);
    const quarter = Number.isNaN(parsedQuarter) ? 1 : parsedQuarter;

    Validate({classSubjectId, quarter})

    try {
        // Ownership: a teacher may only open the gradebook of a class subject
        // they are assigned to (403 otherwise). Admins bypass.
        const teacherId = await resolveActorTeacherId(req.user!);
        await assertTeacherOwnsClassSubject(teacherId, Number(classSubjectId));

        const result = await getGradeBookDetailsByClassSubjectIdService(classSubjectId, quarter)
        return res.status(200).json(SuccessResponse({
            message: "Retrieve Successfull",
            data: result
        }))
    }catch(err) {
        next(err)
    }
}