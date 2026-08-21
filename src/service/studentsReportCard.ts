import StudentReportCardModel from "../model/studentReportCard.js";
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";

import type{Subjects} from "../constant/report-card.js"


// ============= Services ===========
import { getSchoolInfoService } from "./schoolInfo.js"
import { calculateFinalGrade } from "../helper/calculateFinalGrade.js";
import { getRemarks } from "../helper/getRemarks.js";

export async function getStudentsController(enrollmentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const reportCardModel = new StudentReportCardModel(connection);
        const students = await reportCardModel.getStudentsReportCard(enrollmentId)
        const schoolInfo = await getSchoolInfoService(connection);
        const quarterlyGrades = await reportCardModel.getStudentQuarterlyGrades(enrollmentId);

        // ================== Instanstiate subjects ===================
        const studentSubjects = new Map<string, Subjects>()
        const subjects = []

        // ==================== Calculate final Grade =======================
        for(const quarterlyGrade of quarterlyGrades) {
            studentSubjects.set(quarterlyGrade.subjectName, {
                name: quarterlyGrade.subjectName,
                quarters: {
                    q1: quarterlyGrade.q1,
                    q2: quarterlyGrade.q2,
                    q3: quarterlyGrade.q3,
                    q4: quarterlyGrade.q4
                },
                finalGrades: calculateFinalGrade({
                    q1: quarterlyGrade.q1 ? String(quarterlyGrade.q1) : null,
                    q2: quarterlyGrade.q2 ? String(quarterlyGrade.q2) : null,
                    q3: quarterlyGrade.q3 ? String(quarterlyGrade.q3) : null,
                    q4: quarterlyGrade.q4 ? String(quarterlyGrade.q4) : null,
                })
            })
        }


        // ========================== Add Remarks ===================
        for(const subject of Array.from(studentSubjects.values())) {
            subjects.push({...subject, remarks: getRemarks})
        }

        // ================= GENERAL AVERAGE ==================
        const average = {
            score: Number((subjects.filter(sub => sub.finalGrades !== null).map(sub => Number(sub.finalGrades)).reduce((sum, grade) => (sum + grade), 0) / subjects.length).toFixed(2)),
            remarks: getRemarks
        }

        if(!students) {
            throw new NotFoundError("Student Not Found", 404);
        }

        return {
            students,
            schoolInfo,
            subjects: subjects,
            generalAverages: average
        };
    }catch(err) {
        throw err
    }
}