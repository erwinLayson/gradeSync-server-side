import type { Response, Request, NextFunction } from "express";
import {
    getGradeBookDetailsByClassSubjectIdService
} from "../service/gradebook.js";
import { assertTeacherCanReadClassSubject, resolveActorTeacherId } from "../service/authorization.js";
import Validate from "../helper/validate.js";
import { SuccessResponse } from "../helper/response.js";


export async function getGradeBookDetailsByClassSubjectIdController(req: Request<{classSubjectId: number}>, res: Response, next: NextFunction) {
    const {classSubjectId} = req.params;
    // Number(undefined) is NaN, and ?? does not catch NaN — fall back explicitly
    const parsedQuarter = Number(req.query.quarter);
    const quarter = Number.isNaN(parsedQuarter) ? 1 : parsedQuarter;

    Validate({classSubjectId, quarter})

    try {
        // Read access: the subject's own teacher, or the adviser of the class the
        // subject belongs to (the My Class > Graded overview reads every subject
        // in the advised class). Admins bypass. Mutations stay strictly owned.
        const teacherId = await resolveActorTeacherId(req.user!);
        await assertTeacherCanReadClassSubject(teacherId, Number(classSubjectId));

        const result = await getGradeBookDetailsByClassSubjectIdService(classSubjectId, quarter)
        return res.status(200).json(SuccessResponse({
            message: "Retrieve Successfull",
            data: result
        }))
    }catch(err) {
        next(err)
    }
}