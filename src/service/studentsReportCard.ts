import StudentReportCardModel from "../model/studentReportCard.js";
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";


// ============= Services ===========
import { getSchoolInfoService } from "./schoolInfo.js"

export async function getStudentsController(enrollmentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const reportCardModel = new StudentReportCardModel(connection);
        const students = await reportCardModel.getStudentsReportCard(enrollmentId)
        const schoolInfo = await getSchoolInfoService(connection);

        if(!students) {
            throw new NotFoundError("Student Not Found", 404);
        }

        return {
            students,
            schoolInfo
        };
    }catch(err) {
        throw err
    }
}