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
        const studentAttendanceRecord = await reportCardModel.getStudentAttendance(enrollmentId);

        console.log(studentAttendanceRecord);

        if(!students) {
            throw new NotFoundError("Student Not Found", 404);
        }

        // if(quarterlyGrades.length === 0) {
        //     throw new NotFoundError("Student has no record in Report Card(Form-138)", 404);
        // }

        // ================== Instantiate subjects ===================
        const studentSubjects = new Map<string, Subjects>()
        const subjects: Subjects[] = []

        // ==================== Calculate final Grade =======================
        for(const quarterlyGrade of quarterlyGrades) {
            const finalGrade = calculateFinalGrade({
                q1: quarterlyGrade.q1 ? String(quarterlyGrade.q1) : null,
                q2: quarterlyGrade.q2 ? String(quarterlyGrade.q2) : null,
                q3: quarterlyGrade.q3 ? String(quarterlyGrade.q3) : null,
                q4: quarterlyGrade.q4 ? String(quarterlyGrade.q4) : null,
            })

            studentSubjects.set(quarterlyGrade.subjectName, {
                name: quarterlyGrade.subjectName,
                quarters: {
                    q1: quarterlyGrade.q1,
                    q2: quarterlyGrade.q2,
                    q3: quarterlyGrade.q3,
                    q4: quarterlyGrade.q4
                },
                finalGrades: finalGrade,
                remarks: finalGrade !== null ? getRemarks(finalGrade) : "N/A"
            })
        }

        // ========================== Add Remarks ===================
        for(const subject of Array.from(studentSubjects.values())) {
            subjects.push(subject)
        }

        // ================= GENERAL AVERAGE ==================
        const gradedSubjects = subjects.filter(sub => sub.finalGrades !== null)
        const averageScore = gradedSubjects.length > 0
            ? Number((gradedSubjects.reduce((sum, sub) => sum + sub.finalGrades!, 0) / gradedSubjects.length).toFixed(2))
            : 0

        const average = {
            score: averageScore,
            remarks: averageScore > 0 ? getRemarks(averageScore) : "N/A"
        }

        return {
            students,
            schoolInfo,
            subjects: subjects,
            generalAverages: average
        };
    } finally {
        connection.release();
    }
}