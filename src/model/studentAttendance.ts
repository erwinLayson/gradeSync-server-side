import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type { StudentAttendanceProps, AttendanceRecord, AttendanceInput } from "../constant/grade.js";

export default class StudentAttendance {
  constructor(private connection: PoolConnection) {}

  // Per-student attendance summary for ONE SUBJECT (class_subjects row). Used
  // by the gradebook so each subject's attendance % is independent — a student
  // can be present in Science and absent in Math on the same day.
  async getAttendanceByClassSubjectId(classSubjectId: number, quarter?: number): Promise<StudentAttendanceProps[]> {
    try {
      let query = `
        SELECT 
            sa.enrollmentId,
            COUNT(*) AS totalDays,
            COALESCE(SUM(sa.status = 'present'), 0) AS presentDays
        FROM 
            student_attendance sa
        WHERE 
            sa.classSubjectId = ?
      `;
      const params: (string | number)[] = [classSubjectId];
      if (quarter !== undefined) {
        query += " AND sa.quarter = ?";
        params.push(quarter);
      }
      query += " GROUP BY sa.enrollmentId";
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);

      return rows as StudentAttendanceProps[];
    } catch (err) {
      throw new InternalServerError("Internal Server error", 500, err);
    }
  }

  // Every attendance record for one subject on one specific date. Used to
  // pre-fill the teacher's daily attendance sheet (one row per student).
  async getAttendanceByClassSubjectAndDate(
    classSubjectId: number,
    date: string,
  ): Promise<AttendanceRecord[]> {
    try {
      const query = `
        SELECT sa.enrollmentId, sa.status
        FROM student_attendance sa
        JOIN enrollments e ON sa.enrollmentId = e.id
        JOIN students s ON e.studentId = s.id
        WHERE sa.classSubjectId = ? AND sa.date = ?
        -- Hide soft-deleted students from the daily sheet
        AND (s.status IS NULL OR s.status <> 'inactive')
        AND e.status IN ('enrolled', 'completed')
      `;
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId, date]);
      return rows as AttendanceRecord[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch attendance", 500, err);
    }
  }

  // Idempotent daily save for one subject: one row per (classSubjectId,
  // enrollmentId, date) is enforced by the uq_attendance_once unique key, so
  // re-saving a day updates existing rows instead of duplicating them. The
  // teacher-chosen quarter (1-4) is stored with every row of the day so the
  // history can be filtered per quarter.
  async upsertAttendanceByDate(
    classSubjectId: number,
    date: string,
    entries: AttendanceInput[],
    quarter: number,
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO student_attendance (classSubjectId, enrollmentId, status, date, quarter)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), quarter = VALUES(quarter)
      `;
      for (const entry of entries) {
        await this.connection.execute<ResultSetHeader>(query, [
          classSubjectId,
          entry.enrollmentId,
          entry.status,
          date,
          quarter,
        ]);
      }
    } catch (err) {
      throw new InternalServerError("Failed to save attendance", 500, err);
    }
  }

  // Resolve a classSubjectId to its parent classId (classrooms.id).
  async getClassIdByClassSubjectId(classSubjectId: number): Promise<number | null> {
    try {
      const query = "SELECT classId FROM class_subjects WHERE id = ? LIMIT 1";
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId]);
      if (rows.length === 0 || rows[0] === undefined) return null;
      return Number(rows[0].classId);
    } catch (err) {
      throw new InternalServerError("Failed to resolve classId from classSubjectId", 500, err);
    }
  }

  // The enrollment ids of students enrolled in the CLASS of this subject. The
  // service uses this to reject attendance saves for students not in the class.
  async getEnrollmentIdsByClassSubjectId(classSubjectId: number): Promise<number[]> {
    try {
      const query = `
        SELECT e.id
        FROM enrollments e
        JOIN class_subjects cs ON cs.classId = e.classId
        JOIN students s ON e.studentId = s.id
        WHERE cs.id = ?
        -- Only active students can have attendance recorded
        AND (s.status IS NULL OR s.status <> 'inactive')
        AND e.status IN ('enrolled', 'completed')
      `;
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId]);
      return rows.map((row) => Number((row as { id: number }).id));
    } catch (err) {
      throw new InternalServerError("Failed to fetch class enrollments", 500, err);
    }
  }

  // One student's full attendance history for ONE SUBJECT: every recorded day
  // with its status, oldest first. Powers the per-student history view.
  // Optionally scoped to a quarter (1-4) and/or a school year — the school
  // year filter resolves through the enrollment, since enrollments carry the
  // schoolYearId and attendance rows are keyed by enrollmentId.
  async getAttendanceHistoryByEnrollmentId(
    classSubjectId: number,
    enrollmentId: number,
    quarter?: number,
    schoolYearId?: number,
  ): Promise<AttendanceRecord[]> {
    try {
      let query = `
        SELECT sa.enrollmentId, sa.status, sa.date, sa.quarter
        FROM student_attendance sa
        WHERE sa.classSubjectId = ? AND sa.enrollmentId = ?
      `;
      const params: (string | number)[] = [classSubjectId, enrollmentId];

      if (quarter !== undefined) {
        query += " AND sa.quarter = ?";
        params.push(quarter);
      }
      if (schoolYearId !== undefined) {
        query +=
          " AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = sa.enrollmentId AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed'))";
        params.push(schoolYearId);
      }
      query += " ORDER BY sa.date ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as AttendanceRecord[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch attendance history", 500, err);
    }
  }
}
