import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { InternalServerError } from "../middleware/errors.js";

import type {
    QuarterSubmissionRow,
    StudentAcademicRecordRow,
    StudentAcademicRecordSubjectRow
} from "../constant/studentRecord.js";

type QuarterColumn = "q1" | "q2" | "q3" | "q4";
const QUARTER_COLUMNS: QuarterColumn[] = ["q1", "q2", "q3", "q4"];

export default class StudentRecord {
    constructor(private connection: PoolConnection) {}

    // ---------------- student_academic_records ----------------

    async getRecordByEnrollmentId(enrollmentId: number): Promise<StudentAcademicRecordRow | null> {
        try {
            const query = `
                SELECT id, enrollmentId, classSection, classGradeLevel, adviserName
                FROM student_academic_records
                WHERE enrollmentId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            return rows.length > 0 ? (rows[0] as StudentAcademicRecordRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch student record", 500, err);
        }
    }

    async getRecordsByEnrollmentIds(enrollmentIds: number[]): Promise<StudentAcademicRecordRow[]> {
        if (enrollmentIds.length === 0) {
            return [];
        }
        try {
            const placeholders = enrollmentIds.map(() => "?").join(", ");
            const query = `
                SELECT id, enrollmentId, classSection, classGradeLevel, adviserName
                FROM student_academic_records
                WHERE enrollmentId IN (${placeholders})
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, enrollmentIds);
            return rows as StudentAcademicRecordRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch student records", 500, err);
        }
    }

    async createRecord(data: {
        enrollmentId: number;
        classSection: string;
        classGradeLevel: number;
        adviserName: string;
    }): Promise<number> {
        try {
            const query = `
                INSERT INTO student_academic_records (enrollmentId, classSection, classGradeLevel, adviserName)
                VALUES (?, ?, ?, ?)
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [
                data.enrollmentId,
                data.classSection,
                data.classGradeLevel,
                data.adviserName
            ]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create student record", 500, err);
        }
    }

    // ---------------- student_academic_record_subjects ----------------

    async getSubjectRowsByRecordIds(recordIds: number[]): Promise<StudentAcademicRecordSubjectRow[]> {
        if (recordIds.length === 0) {
            return [];
        }
        try {
            const placeholders = recordIds.map(() => "?").join(", ");
            const query = `
                SELECT id, recordId, subjectName, subjectCode, q1, q2, q3, q4
                FROM student_academic_record_subjects
                WHERE recordId IN (${placeholders})
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, recordIds);
            return rows as StudentAcademicRecordSubjectRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch record subject grades", 500, err);
        }
    }

    // Freeze one quarter's grade for a subject row. Idempotent: relies on the
    // uq_record_subject_name (recordId, subjectName) unique key, so re-freezing
    // after a reopen simply overwrites the previous value. The subject's name
    // and code are snapshotted at freeze time so later catalog changes (or a
    // hard delete) can never alter an existing academic record.
    async upsertSubjectQuarterGrade(recordId: number, subjectName: string, subjectCode: string, quarter: number, grade: number): Promise<void> {
        const column = QUARTER_COLUMNS[quarter - 1];
        if (!column) {
            throw new InternalServerError(`Invalid quarter: ${quarter}`, 500);
        }
        try {
            const query = `
                INSERT INTO student_academic_record_subjects (recordId, subjectName, subjectCode, ${column})
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE ${column} = VALUES(${column})
            `;
            await this.connection.execute<ResultSetHeader>(query, [recordId, subjectName, subjectCode, grade]);
        } catch (err) {
            throw new InternalServerError("Failed to save record subject grade", 500, err);
        }
    }

    // ---------------- student_academic_record_quarters ----------------

    async getQuarterSubmission(recordId: number, quarter: number): Promise<QuarterSubmissionRow | null> {
        try {
            const query = `
                SELECT id, recordId, quarter, status, submittedAt, submittedBy
                FROM student_academic_record_quarters
                WHERE recordId = ? AND quarter = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [recordId, quarter]);
            return rows.length > 0 ? (rows[0] as QuarterSubmissionRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch quarter submission", 500, err);
        }
    }

    async getSubmissionsByRecordIds(recordIds: number[], quarter: number): Promise<QuarterSubmissionRow[]> {
        if (recordIds.length === 0) {
            return [];
        }
        try {
            const placeholders = recordIds.map(() => "?").join(", ");
            const query = `
                SELECT id, recordId, quarter, status, submittedAt, submittedBy
                FROM student_academic_record_quarters
                WHERE recordId IN (${placeholders}) AND quarter = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [...recordIds, quarter]);
            return rows as QuarterSubmissionRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch quarter submissions", 500, err);
        }
    }

    // Idempotent submit: inserting again re-freezes (bumps submittedAt) — E4.
    async upsertQuarterSubmission(recordId: number, quarter: number, submittedBy: number | null): Promise<void> {
        try {
            const query = `
                INSERT INTO student_academic_record_quarters (recordId, quarter, status, submittedAt, submittedBy)
                VALUES (?, ?, 'submitted', NOW(), ?)
                ON DUPLICATE KEY UPDATE
                    status = 'submitted',
                    submittedAt = NOW(),
                    submittedBy = VALUES(submittedBy)
            `;
            await this.connection.execute<ResultSetHeader>(query, [recordId, quarter, submittedBy]);
        } catch (err) {
            throw new InternalServerError("Failed to save quarter submission", 500, err);
        }
    }

    // Reopen: flip back to pending but KEEP submittedAt/submittedBy (audit trail — E5).
    // Returns false when the quarter was not currently submitted.
    async reopenQuarterSubmission(recordId: number, quarter: number): Promise<boolean> {
        try {
            const query = `
                UPDATE student_academic_record_quarters
                SET status = 'pending'
                WHERE recordId = ? AND quarter = ? AND status = 'submitted'
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [recordId, quarter]);
            return result.affectedRows > 0;
        } catch (err) {
            throw new InternalServerError("Failed to reopen quarter submission", 500, err);
        }
    }

    // ---------------- subjects / enrollment subjects ----------------

    // Subjects taught in a class (class_subjects joined to subjects).
    async getClassSubjects(classId: number): Promise<{ classSubjectId: number; subjectId: number; subjectName: string; subjectCode: string }[]> {
        try {
            const query = `
                SELECT cs.id AS classSubjectId, s.id AS subjectId, s.name AS subjectName, s.code AS subjectCode
                FROM class_subjects cs
                JOIN subjects s ON s.id = cs.subjectId
                WHERE cs.classId = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows as { classSubjectId: number; subjectId: number; subjectName: string; subjectCode: string }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch class subjects", 500, err);
        }
    }

    // Enrolled subjects (enrollment_details) for the given enrollments. The
    // caller intersects these with the class's subjects (E7).
    async getEnrollmentSubjectIds(enrollmentIds: number[]): Promise<{ enrollmentId: number; subjectId: number }[]> {
        if (enrollmentIds.length === 0) {
            return [];
        }
        try {
            const placeholders = enrollmentIds.map(() => "?").join(", ");
            const query = `
                SELECT enrollmentId, subjectId
                FROM enrollment_details
                WHERE enrollmentId IN (${placeholders})
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, enrollmentIds);
            return rows as { enrollmentId: number; subjectId: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment subjects", 500, err);
        }
    }

    // ---------------- enforcement / admin summary ----------------

    async getActiveSchoolYearId(): Promise<number | null> {
        try {
            const query = "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            const row = rows[0] as { id: number } | undefined;
            return row ? Number(row.id) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch active school year", 500, err);
        }
    }

    // Classes in the school year that have enrolled students but no assigned adviser.
    async getClassesWithoutAdviser(schoolYearId: number): Promise<{ classId: number; section: string }[]> {
        try {
            const query = `
                SELECT DISTINCT c.id AS classId, c.section
                FROM enrollments e
                JOIN classrooms c ON c.id = e.classId
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                LEFT JOIN class_teacher ct ON ct.classId = c.id
                WHERE e.schoolYearId = ? AND e.status IN ('enrolled', 'completed') AND ct.id IS NULL
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
            return rows as { classId: number; section: string }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch classes without adviser", 500, err);
        }
    }

    // Classes where some active enrollments still lack a submitted record for the quarter.
    async getIncompleteClasses(
        quarter: number,
        schoolYearId: number
    ): Promise<{ classId: number; section: string; total: number; submitted: number }[]> {
        try {
            const query = `
                SELECT c.id AS classId, c.section,
                       COUNT(DISTINCT e.id) AS total,
                       COUNT(DISTINCT CASE WHEN sarq.id IS NOT NULL AND sarq.status = 'submitted' THEN e.id END) AS submitted
                FROM enrollments e
                JOIN classrooms c ON c.id = e.classId
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                LEFT JOIN student_academic_records sar ON sar.enrollmentId = e.id
                LEFT JOIN student_academic_record_quarters sarq
                    ON sarq.recordId = sar.id AND sarq.quarter = ? AND sarq.status = 'submitted'
                WHERE e.status IN ('enrolled', 'completed') AND e.schoolYearId = ?
                GROUP BY c.id, c.section
                HAVING submitted < total
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [quarter, schoolYearId]);
            return rows as { classId: number; section: string; total: number; submitted: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch incomplete classes", 500, err);
        }
    }

    // Per-class rollup for the admin submission tracker.
    async getSubmissionSummary(
        schoolYearId: number
    ): Promise<{ classId: number; section: string; gradeLevel: number; adviserId: number | null; adviserFullname: string | null; totalStudents: number }[]> {
        try {
            const query = `
                SELECT c.id AS classId, c.section, c.gradeLevel,
                       t.id AS adviserId,
                       CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS adviserFullname,
                       COUNT(DISTINCT CASE WHEN (s.status IS NULL OR s.status <> 'inactive') THEN e.id END) AS totalStudents
                FROM classrooms c
                LEFT JOIN class_teacher ct ON ct.classId = c.id
                LEFT JOIN teachers t ON t.id = ct.teacherId
                LEFT JOIN enrollments e ON e.classId = c.id AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')
                LEFT JOIN students s ON s.id = e.studentId
                -- Archived classes are hidden from the tracker (soft delete).
                WHERE c.status IS NULL OR c.status <> 'inactive'
                GROUP BY c.id, t.id
                ORDER BY c.gradeLevel, c.section
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
            return rows as { classId: number; section: string; gradeLevel: number; adviserId: number | null; adviserFullname: string | null; totalStudents: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch submission summary", 500, err);
        }
    }

    // Per-class submitted counts per quarter (feeds the summary rollup).
    async getSubmittedCountsByClass(schoolYearId: number): Promise<{ classId: number; quarter: number; submittedCount: number }[]> {
        try {
            const query = `
                SELECT e.classId, sarq.quarter, COUNT(DISTINCT e.id) AS submittedCount
                FROM enrollments e
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                JOIN student_academic_records sar ON sar.enrollmentId = e.id
                JOIN student_academic_record_quarters sarq ON sarq.recordId = sar.id AND sarq.status = 'submitted'
                WHERE e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')
                GROUP BY e.classId, sarq.quarter
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
            return rows as { classId: number; quarter: number; submittedCount: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch submitted counts", 500, err);
        }
    }
}
