import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// One row of the semester-end cleanup precondition check (audit F-4).
// `recordId === null` means the enrollment was never finalized at all.
export interface SnapshotCompletenessRow {
    enrollmentId: number;
    fullname: string;
    recordId: number | null;
    requiredSubjects: number;
    frozenSubjects: number;
    subjectsMissingGrades: number;
    submittedQuarters: number;
}

export default class Enrollments {
    constructor(private connection: PoolConnection) {}

    // Create a new enrollment record (dateEnrolled defaults to today)
    async createEnrollment(classId: number, schoolYearId: number, studentId: number): Promise<number> {
        try {
            const query = `
                INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId)
                VALUES(CURDATE(), ?, ?, ?)
            `;

            const [result] = await this.connection.execute<ResultSetHeader>(query, [classId, schoolYearId, studentId]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create enrollment", 500, err);
        }
    }

    // Link the enrollment to a classroom
    async createClassStudent(classId: number, enrollmentId: number): Promise<void> {
        try {
            const query = "INSERT INTO class_students(classId, enrollmentId) VALUES(?, ?)";

            await this.connection.execute(query, [classId, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to link student to classroom", 500, err);
        }
    }

    // Link a subject to the enrollment
    async createEnrollmentDetail(enrollmentId: number, subjectId: number): Promise<void> {
        try {
            const query = "INSERT INTO enrollment_details(enrollmentId, subjectId) VALUES(?, ?)";

            await this.connection.execute(query, [enrollmentId, subjectId]);
        } catch (err) {
            throw new InternalServerError("Failed to link enrollment subject", 500, err);
        }
    }

    // Check whether a student is already enrolled in a given school year
    async isStudentEnrolled(studentId: number, schoolYearId: number): Promise<boolean> {
        try {
            const query = "SELECT id FROM enrollments WHERE studentId = ? AND schoolYearId = ? AND status = 'enrolled' LIMIT 1";

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId, schoolYearId]);
            return rows.length > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check existing enrollment", 500, err);
        }
    }

    // Get enrollment by ID
    async getEnrollmentById(enrollmentId: number): Promise<RowDataPacket | null> {
        try {
            const query = "SELECT * FROM enrollments WHERE id = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            return rows[0] ?? null;
        } catch (err) {
            throw new InternalServerError("Failed to get enrollment", 500, err);
        }
    }

    // Soft-delete enrollment (set status to 'unenrolled')
    async softDeleteEnrollment(enrollmentId: number): Promise<void> {
        try {
            const query = "UPDATE enrollments SET status = 'unenrolled' WHERE id = ? AND status = 'enrolled'";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to soft-delete enrollment", 500, err);
        }
    }

    // Delete class_students record by enrollmentId
    async deleteClassStudentByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM class_students WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to remove student from classroom", 500, err);
        }
    }

    // Delete enrollment_details records by enrollmentId
    async deleteEnrollmentDetailsByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM enrollment_details WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to remove enrollment details", 500, err);
        }
    }

    // Get student ID from enrollment
    async getStudentIdFromEnrollment(enrollmentId: number): Promise<number | null> {
        try {
            const query = "SELECT studentId FROM enrollments WHERE id = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            const row = rows[0];
            return row ? row.studentId : null;
        } catch (err) {
            throw new InternalServerError("Failed to get student from enrollment", 500, err);
        }
    }

    async getStudentEnrollmentRecordByStudentId(studentId: number): Promise<{ enrollmentId: number; schoolYear: string; classId: number }[]> {
        try {
            const query = `
                SELECT 
                e.id AS enrollmentId,
                e.classId,
                CONCAT(sy.startYear, "-" , sy.endYear) AS schoolYear
                FROM enrollments e
                JOIN 
                    students s ON s.id = e.studentId
                JOIN 
                    schoolyear sy ON sy.id = e.schoolYearId
                WHERE e.studentId = ?
                -- Chronological (oldest first) so the SF10/Form-137 lists each
                -- school year under its own grade level in order, and the last
                -- row really is the most recent year attended.
                ORDER BY sy.startYear ASC, sy.endYear ASC, e.id ASC
            `;

            const [row] = await this.connection.execute<RowDataPacket[]>(query, [studentId]);

            return row as { enrollmentId: number; schoolYear: string; classId: number }[];
        }catch(err){
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Get existing enrollment for a student in a specific school year (any status)
    async getExistingEnrollment(studentId: number, schoolYearId: number): Promise<{ id: number; classId: number; status: string } | null> {
        try {
            const query = "SELECT id, classId, status FROM enrollments WHERE studentId = ? AND schoolYearId = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId, schoolYearId]);
            const row = rows[0];
            return row ? { id: row.id, classId: row.classId, status: row.status } : null;
        } catch (err) {
            throw new InternalServerError("Failed to get existing enrollment", 500, err);
        }
    }

    // Check if student has grades for a specific quarter
    async hasGradesForQuarter(enrollmentId: number, quarter: number): Promise<boolean> {
        try {
            const query = `
                SELECT COUNT(*) AS cnt
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                WHERE ss.enrollmentId = ? AND a.quarter = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId, quarter]);
            return Number(rows[0]?.cnt ?? 0) > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check grades for quarter", 500, err);
        }
    }

    // Update enrollment class
    async updateEnrollmentClass(enrollmentId: number, classId: number): Promise<void> {
        try {
            const query = "UPDATE enrollments SET classId = ? WHERE id = ?";
            await this.connection.execute(query, [classId, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to update enrollment class", 500, err);
        }
    }

    // Update enrollment status
    async updateEnrollmentStatus(enrollmentId: number, status: string): Promise<void> {
        try {
            const query = "UPDATE enrollments SET status = ? WHERE id = ?";
            await this.connection.execute(query, [status, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to update enrollment status", 500, err);
        }
    }

    // Delete student scores by enrollmentId
    async deleteStudentScoresByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM student_scores WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete student scores", 500, err);
        }
    }

    // Delete student attendance by enrollmentId
    async deleteStudentAttendanceByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM student_attendance WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete student attendance", 500, err);
        }
    }

    // Get all active enrollment IDs for a classroom
    async getActiveEnrollmentIdsByClassId(classId: number): Promise<number[]> {
        try {
            const query = "SELECT id FROM enrollments WHERE classId = ? AND status = 'enrolled'";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows.map((row) => row.id);
        } catch (err) {
            throw new InternalServerError("Failed to get active enrollment IDs", 500, err);
        }
    }

    // ---------------------------------------------------------------------
    // Semester-end cleanup precondition support (audit F-4).
    // ---------------------------------------------------------------------

    // Active (status='enrolled') enrollment ids for a classroom, row-locked for
    // the rest of the caller's transaction. Locking the enrollment rows stops a
    // concurrent enrollment change (transfer / unenroll / re-enroll) from
    // slipping past the snapshot-completeness check below.
    async lockActiveEnrollmentIdsByClassId(classId: number): Promise<number[]> {
        try {
            const query = "SELECT id FROM enrollments WHERE classId = ? AND status = 'enrolled' FOR UPDATE";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows.map((row) => Number(row.id));
        } catch (err) {
            throw new InternalServerError("Failed to lock active enrollment IDs", 500, err);
        }
    }

    // Row-lock the frozen academic records for these enrollments and return
    // their ids. Locking them serialises cleanup against a concurrent grade
    // finalization (freezeRecordWithin writes these same rows).
    async lockAcademicRecordIdsByEnrollmentIds(enrollmentIds: number[]): Promise<number[]> {
        if (enrollmentIds.length === 0) {
            return [];
        }
        try {
            const placeholders = enrollmentIds.map(() => "?").join(", ");
            const query = `SELECT id FROM student_academic_records WHERE enrollmentId IN (${placeholders}) FOR UPDATE`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, enrollmentIds);
            return rows.map((row) => Number(row.id));
        } catch (err) {
            throw new InternalServerError("Failed to lock academic record IDs", 500, err);
        }
    }

    // Row-lock the per-quarter submission ledger rows for these records.
    async lockRecordQuarterIdsByRecordIds(recordIds: number[]): Promise<number[]> {
        if (recordIds.length === 0) {
            return [];
        }
        try {
            const placeholders = recordIds.map(() => "?").join(", ");
            const query = `SELECT id FROM student_academic_record_quarters WHERE recordId IN (${placeholders}) FOR UPDATE`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, recordIds);
            return rows.map((row) => Number(row.id));
        } catch (err) {
            throw new InternalServerError("Failed to lock record quarter IDs", 500, err);
        }
    }

    // Per-enrollment snapshot completeness for the active enrollments of a
    // classroom, measured against the configured grading periods:
    //   - recordId:            the frozen record (null when never submitted)
    //   - requiredSubjects:    enrollment_details ∩ class_subjects for this class
    //   - frozenSubjects:      frozen subject grade rows on the record
    //   - subjectsMissingGrades: frozen subject rows with a NULL grade in any
    //                            configured quarter (a row alone is not enough)
    //   - submittedQuarters:   'submitted' ledger rows within 1..numQuarters
    async getSnapshotCompletenessByClassId(classId: number, numQuarters: number): Promise<SnapshotCompletenessRow[]> {
        try {
            const quarterColumns = (["q1", "q2", "q3", "q4"] as const)
                .slice(0, Math.max(1, Math.min(4, numQuarters)));
            const missingGradeExpr = quarterColumns.map((column) => `sars.${column} IS NULL`).join(" OR ");

            const query = `
                SELECT
                    e.id AS enrollmentId,
                    CONCAT_WS(" ", s.firstname, s.middlename, s.lastname,
                              IF(s.suffix IS NOT NULL, s.suffix, "")) AS fullname,
                    sar.id AS recordId,
                    (
                        SELECT COUNT(*)
                        FROM enrollment_details ed
                        JOIN class_subjects cs ON cs.subjectId = ed.subjectId AND cs.classId = e.classId
                        WHERE ed.enrollmentId = e.id
                    ) AS requiredSubjects,
                    (
                        SELECT COUNT(*)
                        FROM student_academic_record_subjects sars
                        WHERE sars.recordId = sar.id
                    ) AS frozenSubjects,
                    (
                        SELECT COUNT(*)
                        FROM student_academic_record_subjects sars
                        WHERE sars.recordId = sar.id AND (${missingGradeExpr})
                    ) AS subjectsMissingGrades,
                    (
                        SELECT COUNT(*)
                        FROM student_academic_record_quarters sarq
                        WHERE sarq.recordId = sar.id
                          AND sarq.status = 'submitted'
                          AND sarq.quarter BETWEEN 1 AND ?
                    ) AS submittedQuarters
                FROM enrollments e
                JOIN students s ON s.id = e.studentId
                LEFT JOIN student_academic_records sar ON sar.enrollmentId = e.id
                WHERE e.classId = ? AND e.status = 'enrolled'
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [numQuarters, classId]);
            return rows.map((row) => ({
                enrollmentId: Number(row.enrollmentId),
                fullname: String(row.fullname ?? ""),
                recordId: row.recordId === null || row.recordId === undefined ? null : Number(row.recordId),
                requiredSubjects: Number(row.requiredSubjects ?? 0),
                frozenSubjects: Number(row.frozenSubjects ?? 0),
                subjectsMissingGrades: Number(row.subjectsMissingGrades ?? 0),
                submittedQuarters: Number(row.submittedQuarters ?? 0)
            }));
        } catch (err) {
            throw new InternalServerError("Failed to check snapshot completeness", 500, err);
        }
    }

    // ---------------------------------------------------------------------

    // Get the student_academic_records ID for an enrollment
    async getRecordIdByEnrollmentId(enrollmentId: number): Promise<number | null> {
        try {
            const query = "SELECT id FROM student_academic_records WHERE enrollmentId = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            return rows[0]?.id ?? null;
        } catch (err) {
            throw new InternalServerError("Failed to get record ID", 500, err);
        }
    }

    // Delete student_academic_record_quarters by recordId
    async deleteRecordQuartersByRecordId(recordId: number): Promise<void> {
        try {
            const query = "DELETE FROM student_academic_record_quarters WHERE recordId = ?";
            await this.connection.execute(query, [recordId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete record quarters", 500, err);
        }
    }

    // Get all class_subject IDs for a classroom
    async getClassSubjectIdsByClassId(classId: number): Promise<number[]> {
        try {
            const query = "SELECT id FROM class_subjects WHERE classId = ?";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows.map((row) => row.id);
        } catch (err) {
            throw new InternalServerError("Failed to get class subject IDs", 500, err);
        }
    }

    // Delete all assessments for a class_subject
    async deleteAssessmentsByClassSubjectId(classSubjectId: number): Promise<void> {
        try {
            const query = "DELETE FROM assessments WHERE classSubjectId = ?";
            await this.connection.execute(query, [classSubjectId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete assessments", 500, err);
        }
    }

    // Count active enrollments across all active classrooms for a school year
    async countActiveEnrollments(schoolYearId: number): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS cnt FROM enrollments WHERE schoolYearId = ? AND status = 'enrolled'";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
            return Number(rows[0]?.cnt ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to count active enrollments", 500, err);
        }
    }

    // Get all active classroom IDs for a school year
    async getActiveClassIdsBySchoolYear(schoolYearId: number): Promise<number[]> {
        try {
            const query = "SELECT DISTINCT classId FROM enrollments WHERE schoolYearId = ? AND status = 'enrolled'";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
            return rows.map((row) => row.classId);
        } catch (err) {
            throw new InternalServerError("Failed to get active class IDs", 500, err);
        }
    }
}
