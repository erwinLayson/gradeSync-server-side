import { PoolConnection, type RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";


import type{ReportCard, Subjects, StudentQaurterlyGrades} from "../constant/report-card.js";



function calculateFinalGrade(quarter: {
    q1: string | null,
    q2: string | null,
    q3: string | null,
    q4: string | null
}):number | null {
    const grades = [
        quarter.q1,
        quarter.q2,
        quarter.q3,
        quarter.q4
    ].filter((grade): grade is string => grade !== null).map(Number);

    const total = grades.reduce((sum, grade) => (sum + grade), 0);

    const finalGrade = Number((total / grades.length).toFixed());

    return finalGrade
}

export default class StudentReportCard {
    constructor(private connection: PoolConnection){}

    async getStudentsReportCard(enrollmentId: number):Promise<ReportCard | null> {
        try {
            const query =  `
                SELECT 
                CONCAT_WS(" ", s.firstname, s.middlename, s.lastname, s.suffix) AS studentFullName,
                TIMESTAMPDIFF(YEAR, s.birthdate, CURDATE()) AS studentAge,
                s.lrn AS studentLrn,
                s.sex AS studentSex,
                CONCAT(sy.startYear, "-", sy.endYear) AS schoolYear,
                c.section AS classSection,
                c.gradeLevel AS classGradeLevel,
                CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, t.suffix) AS classAdviser
                FROM 
                    enrollments e
                JOIN 
                    students s ON s.id = e.studentId
                JOIN 
                    schoolYear sy ON sy.id = e.schoolYearId
                JOIN 
                    classrooms c ON c.id = e.classId
                JOIN 
                    class_teacher ct ON ct.classId = c.id
                JOIN 
                    teachers t ON ct.teacherId = t.id
                WHERE e.id = ?

            `;
            const [row] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            
            const student = row[0] as ReportCard;
            return row.length > 0 ? student : null
        }catch(err) {
            throw new InternalServerError("Internal Server Error ", 500, err);
        }
    }

    async getStudentQuarterlyGrades(enrollmentId: number):Promise<StudentQaurterlyGrades[]> {
        try {
            const query = `
                SELECT
                    sars.subjectName as subjectName,
                    sars.q1,
                    sars.q2,
                    sars.q3,
                    sars.q4
                FROM 
                    student_academic_records sar
                JOIN 
                    student_academic_record_subjects sars ON sars.recordId = sar.id
                WHERE 
                    sar.enrollmentId = ?
            `;

            const values = [enrollmentId]

            const [row] = await this.connection.execute<RowDataPacket[]>(query, values);

            return row as StudentQaurterlyGrades[];
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

}