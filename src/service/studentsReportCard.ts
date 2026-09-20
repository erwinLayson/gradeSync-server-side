import StudentReportCardModel from "../model/studentReportCard.js";
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";

// ============= Services ===========
import { getSchoolInfoService } from "./schoolInfo.js";
import { getNumQuarters } from "./academicSettings.js";

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

        // Respect the admin-configured number of grading periods: quarters
        // beyond it are excluded from final grades and hidden in the PDF.
        const numQuarters = await getNumQuarters();

        const subjects = buildSubjectList(quarterlyGrades, componentGradesBySubject, numQuarters);
        const generalAverages = computeGeneralAverage(subjects);

        return {
            students,
            schoolInfo,
            subjects,
            generalAverages,
            attendance,
            numQuarters,
        };
    } finally {
        connection.release();
    }
}
