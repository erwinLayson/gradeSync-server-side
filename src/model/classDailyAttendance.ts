import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type { AttendanceRecord, AttendanceInput } from "../constant/grade.js";

/** Monthly summary for one student — powers the report card. */
export interface MonthlyAttendanceSummary {
  enrollmentId: number;
  month: number;
  schoolDays: number;
  presentDays: number;
  absentDays: number;
}

export default class ClassDailyAttendance {
  constructor(private connection: PoolConnection) {}

  // ── Write ──────────────────────────────────────────────────────────

  /**
   * Idempotent daily save for the class adviser: one row per
   * (classId, enrollmentId, date). Re-saving a day updates existing rows
   * instead of duplicating them (enforced by uq_class_attendance_once).
   */
  async upsertByDate(
    classId: number,
    date: string,
    entries: AttendanceInput[],
    quarter: number,
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO class_daily_attendance (classId, enrollmentId, status, date, quarter)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), quarter = VALUES(quarter)
      `;
      for (const entry of entries) {
        await this.connection.execute<ResultSetHeader>(query, [
          classId,
          entry.enrollmentId,
          entry.status,
          date,
          quarter,
        ]);
      }
    } catch (err) {
      throw new InternalServerError("Failed to save class daily attendance", 500, err);
    }
  }

  // ── Read ───────────────────────────────────────────────────────────

  /**
   * Every attendance record for the class on one specific date.
   * Used to pre-fill the daily attendance sheet.
   */
  async getByClassAndDate(classId: number, date: string): Promise<AttendanceRecord[]> {
    try {
      const query = `
        SELECT cda.enrollmentId, cda.status
        FROM class_daily_attendance cda
        JOIN enrollments e ON cda.enrollmentId = e.id
        JOIN students s ON e.studentId = s.id
        WHERE cda.classId = ? AND cda.date = ?
          AND (s.status IS NULL OR s.status <> 'inactive')
          AND e.status IN ('enrolled', 'completed')
      `;
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId, date]);
      return rows as AttendanceRecord[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch class daily attendance", 500, err);
    }
  }

  /**
   * One student's full attendance history for the class (every recorded day
   * + status), optionally scoped to a quarter.
   */
  async getByEnrollmentForHistory(
    classId: number,
    enrollmentId: number,
    quarter?: number,
  ): Promise<AttendanceRecord[]> {
    try {
      let query = `
        SELECT cda.enrollmentId, cda.status, cda.date, cda.quarter
        FROM class_daily_attendance cda
        WHERE cda.classId = ? AND cda.enrollmentId = ?
      `;
      const params: (string | number)[] = [classId, enrollmentId];

      if (quarter !== undefined) {
        query += " AND cda.quarter = ?";
        params.push(quarter);
      }
      query += " ORDER BY cda.date ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as AttendanceRecord[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch class attendance history", 500, err);
    }
  }

  /**
   * Per-student monthly attendance summary for the class — powers the
   * report card / student card. Returns one row per month with
   * schoolDays, presentDays, absentDays.
   */
  async getMonthlySummary(
    classId: number,
    enrollmentId: number,
    quarter?: number,
  ): Promise<MonthlyAttendanceSummary[]> {
    try {
      let query = `
        SELECT
          cda.enrollmentId,
          MONTH(cda.date) AS month,
          COUNT(*) AS schoolDays,
          COALESCE(SUM(cda.status = 'present'), 0) AS presentDays,
          COALESCE(SUM(cda.status = 'absent'), 0) AS absentDays
        FROM class_daily_attendance cda
        WHERE cda.classId = ? AND cda.enrollmentId = ?
      `;
      const params: (string | number)[] = [classId, enrollmentId];

      if (quarter !== undefined) {
        query += " AND cda.quarter = ?";
        params.push(quarter);
      }
      query += " GROUP BY cda.enrollmentId, MONTH(cda.date) ORDER BY month ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as MonthlyAttendanceSummary[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch monthly attendance summary", 500, err);
    }
  }
}
