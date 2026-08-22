import StudentReportCardModel from "../model/studentReportCard.js";
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";

// ============= Services ===========
import { getSchoolInfoService } from "./schoolInfo.js";

// ============= Helpers ===========
import { buildSubjectList } from "../helper/buildSubjectList.js";
import { computeGeneralAverage } from "../helper/computeGeneralAverage.js";

export async function getStudentReportCardService(enrollmentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const reportCardModel = new StudentReportCardModel(connection);

        const [students, schoolInfo, quarterlyGrades, attendance, componentGradesBySubject] =
            await Promise.all([
                reportCardModel.getStudentsReportCard(enrollmentId),
                getSchoolInfoService(connection),
                reportCardModel.getStudentQuarterlyGrades(enrollmentId),
                reportCardModel.getStudentAttendance(enrollmentId),
                reportCardModel.getComponentGradesByEnrollment(enrollmentId),
            ]);

        if (!students) {
            throw new NotFoundError("Student Not Found", 404);
        }

        const subjects = buildSubjectList(quarterlyGrades, componentGradesBySubject);
        const generalAverages = computeGeneralAverage(subjects);

        return {
            students,
            schoolInfo,
            subjects,
            generalAverages,
            attendance,
        };
    } finally {
        connection.release();
    }
}
