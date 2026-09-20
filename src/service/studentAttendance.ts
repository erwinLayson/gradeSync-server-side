import StudentAttendanceModel from "../model/studentAttendance.js";
import ClassDailyAttendanceModel from "../model/classDailyAttendance.js";

import type { PoolConnection } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError } from "../middleware/errors.js";
import type { RowDataPacket } from "mysql2/promise";

import type { AttendanceInput, AttendanceRecord, AttendanceStatus } from "../constant/grade.js";
import { getNumQuarters } from "./academicSettings.js";

// One student's attendance history for a subject with a computed summary.
export interface AttendanceHistory {
    classSubjectId: number;
    enrollmentId: number;
    presentDays: number;
    totalDays: number;
    percentage: number | null;
    records: AttendanceRecord[];
}


// Resolve the userId of the class adviser for a given classId.
// Returns null when the class has no adviser or the classId is unknown.
async function getAdviserUserIdOfClass(
  connection: PoolConnection,
  classId: number,
): Promise<number | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT u.id AS userId
     FROM class_teacher ct
     JOIN teachers t ON t.id = ct.teacherId
     JOIN users u ON u.id = t.userId
     WHERE ct.classId = ?
     LIMIT 1`,
    [classId],
  );
  if (rows.length === 0 || rows[0] === undefined) return null;
  return Number(rows[0].userId);
}

function isValidAttendanceStatus(status: string): status is AttendanceStatus {
  return status === "present" || status === "absent";
}

function isValidQuarter(quarter: number, numQuarters: number = 4): boolean {
  return Number.isInteger(quarter) && quarter >= 1 && quarter <= numQuarters;
}

// Reject malformed/impossible date strings early so the DB never sees garbage.
function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip the parts: JS rolls "2026-02-30" over to March 2, so compare the
  // parsed components against the input to reject impossible calendar dates.
  return (
    parsed.getFullYear() === Number(date.slice(0, 4)) &&
    parsed.getMonth() + 1 === Number(date.slice(5, 7)) &&
    parsed.getDate() === Number(date.slice(8, 10))
  );
}

// Normalize a DATE value to a yyyy-mm-dd string. mysql2 returns DATE columns as
// JS Date objects (UTC midnight rendered in the local timezone); a string input
// is already the literal yyyy-mm-dd from the DB and must NOT go through the Date
// constructor (that would re-parse it as UTC and shift the day in UTC-x zones).
function toDateOnly(value: string | Date | undefined | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  }
  if (Number.isNaN(value.getTime())) return "";
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}


// Per-student attendance summary for one subject (gradebook consumption).
export async function getStudentAttendanceByClassSubjectIdService(
  classSubjectId: number,
  conn?: PoolConnection,
  quarter?: number,
) {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  try {
    const studentAttendanceModel = new StudentAttendanceModel(connection);

    const attendanceRows = await studentAttendanceModel.getAttendanceByClassSubjectId(classSubjectId, quarter);

    // COUNT()/SUM() over the attendance table come back from the driver as strings;
    // normalize so callers always receive real numbers.
    return attendanceRows.map((row) => ({
        enrollmentId: row.enrollmentId,
        presentDays: Number(row.presentDays),
        totalDays: Number(row.totalDays),
    }));
  } catch (err) {
    throw err;
  } finally {
    if (ownConn) {
      connection.release();
    }
  }
}

// All attendance records for one subject on one date (prefills the daily sheet).
export async function getAttendanceByClassSubjectAndDateService(
  classSubjectId: number,
  date: string,
  conn?: PoolConnection,
) {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  try {
    if (!isValidDate(date)) {
      throw new BadRequestError("Date must be a valid YYYY-MM-DD string");
    }
    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const rows: AttendanceRecord[] = await studentAttendanceModel.getAttendanceByClassSubjectAndDate(
      classSubjectId,
      date,
    );
    return rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      status: row.status,
    }));
  } finally {
    if (ownConn) connection.release();
  }
}

// Save (or overwrite) one day of attendance for one subject. Every submitted
// enrollment must actually be enrolled in the subject's class, and every status
// must be present/absent; the write is idempotent per (classSubjectId,
// enrollmentId, date). The teacher-chosen quarter (1-4) is stored with the day
// so history can later be filtered per quarter.
//
// When teacherUserId is provided and the teacher is the class adviser (found in
// the class_teacher table), the same entries are ALSO written to
// class_daily_attendance — the adviser-level table that powers the report card.
export async function saveAttendanceByClassSubjectAndDateService(
  classSubjectId: number,
  date: string,
  entries: AttendanceInput[],
  quarter: number,
  teacherUserId?: number | null,
  conn?: PoolConnection,
) {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  let transactionStarted = false;
  try {
    if (!isValidDate(date)) {
      throw new BadRequestError("Date must be a valid YYYY-MM-DD string");
    }
    if (entries.length === 0) {
      throw new BadRequestError("Attendance entries cannot be empty");
    }
    const numQuarters = await getNumQuarters();
    if (!isValidQuarter(quarter, numQuarters)) {
      throw new BadRequestError(
        `quarter must be a number between 1 and ${numQuarters}`
      );
    }
    for (const entry of entries) {
      if (!isValidAttendanceStatus(entry.status)) {
        throw new BadRequestError(`Invalid attendance status: ${entry.status}`);
      }
    }

    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const enrolledIds = new Set(
      await studentAttendanceModel.getEnrollmentIdsByClassSubjectId(classSubjectId),
    );
    const unknownEnrollment = entries.find((entry) => !enrolledIds.has(entry.enrollmentId));
    if (unknownEnrollment) {
      throw new BadRequestError(
        `Enrollment ${unknownEnrollment.enrollmentId} is not enrolled in class subject ${classSubjectId}`
      );
    }

    await connection.beginTransaction();
    transactionStarted = true;

    // 1. Always save to the per-subject attendance table (used for grading).
    await studentAttendanceModel.upsertAttendanceByDate(classSubjectId, date, entries, quarter);

    // 2. If the caller is a teacher, check whether they are the class adviser.
    //    If so, mirror the save into class_daily_attendance (report-card source).
    if (teacherUserId != null) {
      const classId = await studentAttendanceModel.getClassIdByClassSubjectId(classSubjectId);
      if (classId !== null) {
        const adviserUserId = await getAdviserUserIdOfClass(connection, classId);
        if (adviserUserId !== null && adviserUserId === teacherUserId) {
          const classDailyModel = new ClassDailyAttendanceModel(connection);
          await classDailyModel.upsertByDate(classId, date, entries, quarter);
        }
      }
    }

    await connection.commit();
  } catch (err) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (ownConn) connection.release();
  }
}

// One student's full attendance history for one subject (every recorded day +
// status) with present/total days and the attendance percentage. When a
// quarter and/or school year is provided, the records AND the summary are
// scoped to that filter, so the percentages always match the rows shown.
export async function getAttendanceHistoryService(
  classSubjectId: number,
  enrollmentId: number,
  quarter?: number,
  schoolYearId?: number,
  conn?: PoolConnection,
): Promise<AttendanceHistory> {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  try {
    if (quarter !== undefined) {
      const numQuarters = await getNumQuarters();
      if (!isValidQuarter(quarter, numQuarters)) {
        throw new BadRequestError(
          `quarter query parameter must be a number between 1 and ${numQuarters}`
        );
      }
    }
    if (schoolYearId !== undefined && (Number.isNaN(schoolYearId) || !Number.isInteger(schoolYearId))) {
      throw new BadRequestError("schoolYearId query parameter must be a number");
    }

    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const rows = await studentAttendanceModel.getAttendanceHistoryByEnrollmentId(
      classSubjectId,
      enrollmentId,
      quarter,
      schoolYearId,
    );

    // The driver returns DATE columns as JS Date objects (UTC midnight rendered
    // in the local timezone, e.g. "2026-08-04T16:00:00.000Z" in UTC+8). Slice to
    // the local yyyy-mm-dd so the client never reinterprets a shifted timestamp.
    const records = rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      status: row.status,
      date: toDateOnly(row.date),
      quarter: row.quarter ?? null,
    }));

    const presentDays = records.filter((row) => row.status === "present").length;
    const totalDays = records.length;
    const percentage =
      totalDays > 0 ? Math.min(100, Math.round((presentDays / totalDays) * 10000) / 100) : null;

    return {
      classSubjectId,
      enrollmentId,
      presentDays,
      totalDays,
      percentage,
      records,
    };
  } finally {
    if (ownConn) connection.release();
  }
}
