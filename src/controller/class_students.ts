import type{ Response, Request, NextFunction } from "express";
import {getClassStudentsByClassIdService} from "../service/class_students.js";

export async function getClassStudentsByClassIdController(req: Request<{classId: number}>, res: Response, next: NextFunction) {
    try {
        const { classId } = req.params;
        const classStudents = await getClassStudentsByClassIdService(classId);
        return res.status(200).json({
            message: "Class students fetched successfully",
            data: classStudents
        });
    } catch (err) {
        next(err);
    }
}