import { PoolConnection, type RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";


import type{ReportCard, StudentQaurterlyGrades, ComponentGradeRow} from "../constant/report-card.js";



export default class StudentReportCard {
    constructor(private connection: PoolConnection){}

    async getStudentsReportCard(enrollmentId: number):Promise<ReportCard | null> {
        try {
            // Historical-first (audit F-1). A submitted academic record is the
            // official, immutable snapshot of the student's section, grade level
            // and adviser for that school year, so it wins whenever it exists.
            // The live classroom / adviser joins are FALLBACKS only (a current,
            // not-yet-frozen school year) and are LEFT JOINs: archiving a class
            // clears its class_adviser row, and a hard-deleted classroom would
            // otherwise make a finalized report card unreadable (404). A live
            // value is never substituted for an available frozen value.
            const query =  `
                SELECT
                CONCAT_WS(" ", s.firstname, s.middlename, s.lastname, s.suffix) AS studentFullName,
                TIMESTAMPDIFF(YEAR, s.birthdate, CURDATE()) AS studentAge,
                s.lrn AS studentLrn,
                s.sex AS studentSex,
                COALESCE(CONCAT(sy.startYear, "-", sy.endYear), "") AS schoolYear,
                COALESCE(sar.classSection, c.section, "") AS classSection,
                COALESCE(sar.classGradeLevel, c.gradeLevel, 0) AS classGradeLevel,
                COALESCE(
                    NULLIF(sar.adviserName, ""),
                    NULLIF(CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, t.suffix), ""),
                    ""
                ) AS classAdviser
                FROM
                    enrollments e
                JOIN
                    students s ON s.id = e.studentId
                LEFT JOIN
                    schoolYear sy ON sy.id = e.schoolYearId
                LEFT JOIN
                    student_academic_records sar ON sar.enrollmentId = e.id
                LEFT JOIN
                    classrooms c ON c.id = e.classId
                LEFT JOIN
                    class_adviser ct ON ct.classId = c.id
                LEFT JOIN
                    faculties t ON ct.facultyId = t.id
                WHERE e.id = ?
                -- There must be SOMETHING to render: a frozen record or a live
                -- classroom. An enrollment whose classroom was deleted and that
                -- was never finalized stays a 404 (the original contract)
                -- instead of producing a fabricated blank card.
                AND (sar.id IS NOT NULL OR c.id IS NOT NULL)
                LIMIT 1
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

    /**
     * Fetch sub-component grades for all subjects that have components
     * (e.g., MAPEH → Music, Arts, PE, Health). Returns a map keyed by
     * subjectName so the service can attach components to the right subject.
     */
    async getComponentGradesByEnrollment(
        enrollmentId: number,
    ): Promise<Map<string, ComponentGradeRow[]>> {
        try {
            const query = `
                SELECT
                    sars.subjectName,
                    sarc.componentName,
                    sarc.q1,
                    sarc.q2,
                    sarc.q3,
                    sarc.q4
                FROM student_academic_records sar
                JOIN student_academic_record_subjects sars ON sars.recordId = sar.id
                JOIN student_academic_record_components sarc ON sarc.subjectRowId = sars.id
                WHERE sar.enrollmentId = ?
                ORDER BY sars.subjectName, sarc.componentName
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);

            const bySubject = new Map<string, ComponentGradeRow[]>();
            for (const row of rows) {
                const subjectName = row.subjectName as string;
                const existing = bySubject.get(subjectName) ?? [];
                existing.push({
                    componentName: row.componentName as string,
                    q1: row.q1 as number | null,
                    q2: row.q2 as number | null,
                    q3: row.q3 as number | null,
                    q4: row.q4 as number | null,
                });
                bySubject.set(subjectName, existing);
            }
            return bySubject;
        } catch (err) {
            throw new InternalServerError("Failed to fetch component grades", 500, err);
        }
    }


    async getStudentAttendance(enrollmentId: number) {
        try {
            // Query class_daily_attendance (adviser-level) instead of
            // student_attendance (per-subject). The adviser's records are the
            // authoritative source for report-card attendance — they give
            // clean per-month totals where present + absent = school days.
            const query =  `
                SELECT
                    MONTH(cda.date) AS month,
                    COUNT(*) AS schoolDays,
                    COALESCE(SUM(cda.status = 'present'), 0) AS presentDays,
                    COALESCE(SUM(cda.status = 'absent'), 0) AS absentDays
                FROM class_daily_attendance cda
                WHERE cda.enrollmentId = ?
                GROUP BY MONTH(cda.date)
                ORDER BY MONTH(cda.date) ASC
            `;

            const values = [enrollmentId];

            const [row] = await this.connection.execute<RowDataPacket[]>(query, values)

            return row;
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

}