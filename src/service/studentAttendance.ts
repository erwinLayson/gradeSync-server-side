import StudentAttendanceModel from "../model/studentAttendance.js";
import ClassDailyAttendanceModel from "../model/classDailyAttendance.js";

import type { PoolConnection } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, ForbiddenError } from "../middleware/errors.js";
import type { RowDataPacket } from "mysql2/promise";

import type { AttendanceInput, AttendanceRecord, AttendanceStatus } from "../constant/grade.js";
import { getNumQuarters, getCurrentQuarter, getAcademicSettingsService } from "./academicSettings.js";
import { executeWithAmendmentAudit } from "./amendmentPermission.js";
import { logActivityService } from "./activityAudit.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../constant/activityAudit.js";

// Shared helpers — never re-implement quarter bounds or the present rate here.
import { isValidQuarter } from "../helper/quarterValidation.js";
import { computeAttendanceRate } from "../helper/attendanceRate.js";

// One student's attendance history for a subject with a computed summary.
export interface AttendanceHistory {
    classSubjectId: number;
    enrollmentId: number;
    presentDays: number;
    totalDays: number;
    percentage: number | null;
    records: AttendanceRecord[];
}

// One row of the class-wide attendance matrix.
export interface AttendanceMatrixStudent {
    enrollmentId: number;
    studentId: number;
    studentLrn: string;
    fullname: string;
    firstname?: string | undefined;
    middlename?: string | null;
    lastname?: string | undefined;
    suffix?: string | null;
}

// One cell of the class-wide attendance matrix: a student on a date.
export interface AttendanceMatrixCell {
    enrollmentId: number;
    date: string;
    status: AttendanceStatus | null;
    quarter: number | null;
}

// The class-wide "spreadsheet" payload: students as rows, recorded dates as
// columns, and the cells that fill the grid.
export interface AttendanceRangeMatrix {
    classSubjectId: number;
    students: AttendanceMatrixStudent[];
    dates: string[];
    records: AttendanceMatrixCell[];
}

// Filters accepted by the matrix read. Every field is independent and they
// combine (school year is resolved through the enrollment, quarter and date
// range on the attendance row itself).
// (`| undefined` alongside `?` keeps callers able to pass a nullable query
// param straight through under exactOptionalPropertyTypes.)
export interface AttendanceRangeQuery {
    schoolYearId?: number | undefined;
    quarter?: number | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}


// Resolve the userId of the class adviser for a given classId.
// Returns null when the class has no adviser or the classId is unknown.
async function getAdviserUserIdOfClass(
  connection: PoolConnection,
  classId: number,
): Promise<number | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT u.id AS userId
     FROM classrooms c
     JOIN faculties t ON t.id = c.adviserFacultyId
     JOIN users u ON u.id = t.userId
     WHERE c.id = ?
     LIMIT 1`,
    [classId],
  );
  if (rows.length === 0 || rows[0] === undefined) return null;
  return Number(rows[0].userId);
}

function isValidAttendanceStatus(status: string): status is AttendanceStatus {
  return status === "present" || status === "absent";
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
// enrollmentId, date). The faculty-chosen quarter (1-4) is stored with the day
// so history can later be filtered per quarter.
//
// When facultyUserId is provided and the faculty is the class adviser (found in
// the class_adviser table), the same entries are ALSO written to
// class_daily_attendance — the adviser-level table that powers the report card.
export async function saveAttendanceByClassSubjectAndDateService(
  classSubjectId: number,
  date: string,
  entries: AttendanceInput[],
  quarter: number,
  facultyUserId?: number | null,
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

    const settings = await getAcademicSettingsService();
    const currentQuarter = settings?.currentQuarter ?? 1;
    if (Boolean(settings?.submissionsLocked)) {
      throw new ForbiddenError("All attendance submissions are locked by the administrator");
    }
    if (quarter < currentQuarter) {
      throw new ForbiddenError(
        `Quarter ${quarter} is locked. Bulk attendance recording is disabled for past quarters. Submit an Amendment Request to modify an individual student's attendance.`
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

    // 2. If the caller is a faculty, check whether they are the class adviser.
    //    If so, mirror the save into class_daily_attendance (report-card source).
    if (facultyUserId != null) {
      const classId = await studentAttendanceModel.getClassIdByClassSubjectId(classSubjectId);
      if (classId !== null) {
        const adviserUserId = await getAdviserUserIdOfClass(connection, classId);
        if (adviserUserId !== null && adviserUserId === facultyUserId) {
          const classDailyModel = new ClassDailyAttendanceModel(connection);
          await classDailyModel.upsertByDate(classId, date, entries, quarter);
        }
      }
    }

    await connection.commit();

    try {
      const presentCount = entries.filter((e) => e.status === "present").length;
      const absentCount = entries.filter((e) => e.status === "absent").length;

      const [csRows] = await connection.execute<RowDataPacket[]>(
        `SELECT cs.classId, cs.subjectId, c.gradeLevel, c.section, s.name AS subjectName,
                sy.id AS schoolYearId, CONCAT(sy.startYear, '-', sy.endYear) AS schoolYear
         FROM class_subjects cs
         JOIN classrooms c ON c.id = cs.classId
         JOIN subjects s ON s.id = cs.subjectId
         LEFT JOIN schoolyear sy ON sy.isActive = 1
         WHERE cs.id = ? LIMIT 1`,
        [classSubjectId]
      );
      const cs = csRows[0];

      if (facultyUserId) {
        await logActivityService({
          actorUserId: facultyUserId,
          action: AUDIT_ACTIONS.ATTENDANCE_RECORDED,
          description: `Recorded attendance for ${date} (${entries.length} students: ${presentCount} present, ${absentCount} absent)`,
          entityType: AUDIT_ENTITY_TYPES.ATTENDANCE,
          entityId: `${classSubjectId}_${date}`,
          schoolYearId: cs?.schoolYearId ? Number(cs.schoolYearId) : null,
          schoolYear: cs?.schoolYear ? String(cs.schoolYear) : null,
          classroomId: cs?.classId ? Number(cs.classId) : null,
          classroomName: cs ? `Grade ${cs.gradeLevel} - ${cs.section}` : null,
          gradeLevel: cs?.gradeLevel ? Number(cs.gradeLevel) : null,
          subjectId: cs?.subjectId ? Number(cs.subjectId) : null,
          subjectName: cs?.subjectName ? String(cs.subjectName) : null,
          quarter,
          status: "success",
          metadata: {
            date,
            totalEntries: entries.length,
            present: presentCount,
            absent: absentCount,
            enrollmentIds: entries.map((e) => e.enrollmentId),
          },
        }, connection);
      }
    } catch (auditErr) {
      console.error("[ActivityAudit] Failed to record attendance audit log:", auditErr);
    }
  } catch (err) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (ownConn) connection.release();
  }
}

// The class-wide attendance matrix for one subject: the roster (rows), the
// distinct recorded dates (columns) and every cell in between. All three
// filters are applied in SQL (model.getAttendanceRangeByClassSubject), so the
// client never has to trim a large dataset — and because the columns are
// derived from the returned rows, a filter can never surface a date that has no
// matching record.
export async function getAttendanceRangeService(
    classSubjectId: number,
    query: AttendanceRangeQuery = {},
    conn?: PoolConnection,
): Promise<AttendanceRangeMatrix> {
    const { schoolYearId, quarter, dateFrom, dateTo } = query;
    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConn = !conn;
    try {
        // Reuse the shared quarter rule; never hardcode 4.
        if (quarter !== undefined) {
            const numQuarters = await getNumQuarters();
            if (!isValidQuarter(quarter, numQuarters)) {
                throw new BadRequestError(
                    `quarter query parameter must be a number between 1 and ${numQuarters}`,
                );
            }
        }
        if (schoolYearId !== undefined && (Number.isNaN(schoolYearId) || !Number.isInteger(schoolYearId))) {
            throw new BadRequestError("schoolYearId query parameter must be a number");
        }
        if (dateFrom !== undefined && !isValidDate(dateFrom)) {
            throw new BadRequestError("dateFrom must be a valid YYYY-MM-DD string");
        }
        if (dateTo !== undefined && !isValidDate(dateTo)) {
            throw new BadRequestError("dateTo must be a valid YYYY-MM-DD string");
        }
        // Compare the ISO strings directly — yyyy-mm-dd sorts chronologically.
        if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
            throw new BadRequestError("dateFrom must not be after dateTo");
        }

        const studentAttendanceModel = new StudentAttendanceModel(connection);
        const [students, rows] = await Promise.all([
            studentAttendanceModel.getAttendanceRosterByClassSubject(classSubjectId, schoolYearId),
            studentAttendanceModel.getAttendanceRangeByClassSubject(classSubjectId, {
                schoolYearId,
                quarter,
                dateFrom,
                dateTo,
            }),
        ]);

        // DATE columns arrive as JS Date objects (UTC midnight rendered locally);
        // normalize to the local yyyy-mm-dd so the client never shifts a day.
        const records: AttendanceMatrixCell[] = [];
        const dates = new Set<string>();
        for (const row of rows) {
            const date = toDateOnly(row.date);
            if (!date) continue;
            dates.add(date);
            records.push({
                enrollmentId: row.enrollmentId,
                date,
                status: row.status,
                quarter: row.quarter ?? null,
            });
        }

        return {
            classSubjectId,
            students: students.map((student) => ({
                enrollmentId: Number(student.enrollmentId),
                studentId: Number(student.studentId),
                studentLrn: student.studentLrn,
                fullname: student.fullname,
                firstname: student.firstname,
                middlename: student.middlename ?? null,
                lastname: student.lastname,
                suffix: student.suffix ?? null,
            })),
            dates: [...dates].sort(),
            records,
        };
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
    const percentage = computeAttendanceRate(presentDays, totalDays);

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

// Atomically save a single student's attendance under an approved amendment permission
export async function saveSingleStudentAttendanceService(
  classSubjectId: number,
  enrollmentId: number,
  date: string,
  status: AttendanceStatus,
  quarter: number,
  actor: { id: number; facultyId: number | null; role: string },
  clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  const pool = getDBPoolConnection();
  const connection = await pool.getConnection();

  await connection.beginTransaction();
  try {
    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const enrolledIds = new Set(
      await studentAttendanceModel.getEnrollmentIdsByClassSubjectId(classSubjectId)
    );
    if (!enrolledIds.has(enrollmentId)) {
      throw new BadRequestError(`Student is not enrolled in class subject ${classSubjectId}`);
    }

    // Fetch existing attendance row for beforeState
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT status FROM student_attendance WHERE classSubjectId = ? AND enrollmentId = ? AND date = ? LIMIT 1",
      [classSubjectId, enrollmentId, date]
    );
    const beforeState = existingRows[0] ? { status: existingRows[0].status, date } : null;
    const afterState = { status, date };

    await executeWithAmendmentAudit(
      connection,
      actor,
      {
        enrollmentId,
        classSubjectId,
        quarter,
        recordType: "attendance",
        attendanceDate: date,
      },
      {
        targetTable: "student_attendance",
        targetRecordId: `${classSubjectId}-${enrollmentId}-${date}`,
        beforeState,
        reason: "Attendance amended via approved request",
        ipAddress: clientMeta?.ipAddress,
        userAgent: clientMeta?.userAgent,
      },
      async () => {
        await studentAttendanceModel.upsertAttendanceByDate(
          classSubjectId,
          date,
          [{ enrollmentId, status }],
          quarter
        );

        // Mirror to class_daily_attendance if teacher is adviser
        const classId = await studentAttendanceModel.getClassIdByClassSubjectId(classSubjectId);
        if (classId !== null) {
          const adviserUserId = await getAdviserUserIdOfClass(connection, classId);
          if (adviserUserId !== null && adviserUserId === actor.id) {
            const classDailyModel = new ClassDailyAttendanceModel(connection);
            await classDailyModel.upsertByDate(classId, date, [{ enrollmentId, status }], quarter);
          }
        }

        return { result: undefined, afterState };
      }
    );

    await connection.commit();

    try {
      const [csRows] = await connection.execute<RowDataPacket[]>(
        `SELECT cs.classId, cs.subjectId, c.gradeLevel, c.section, s.name AS subjectName,
                sy.id AS schoolYearId, CONCAT(sy.startYear, '-', sy.endYear) AS schoolYear
         FROM class_subjects cs
         JOIN classrooms c ON c.id = cs.classId
         JOIN subjects s ON s.id = cs.subjectId
         LEFT JOIN schoolyear sy ON sy.isActive = 1
         WHERE cs.id = ? LIMIT 1`,
        [classSubjectId]
      );
      const cs = csRows[0];

      await logActivityService({
        actorUserId: actor.id,
        action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
        description: `Updated attendance for enrollment #${enrollmentId} on ${date} to "${status}"`,
        entityType: AUDIT_ENTITY_TYPES.ATTENDANCE,
        entityId: `${classSubjectId}_${enrollmentId}_${date}`,
        schoolYearId: cs?.schoolYearId ? Number(cs.schoolYearId) : null,
        schoolYear: cs?.schoolYear ? String(cs.schoolYear) : null,
        classroomId: cs?.classId ? Number(cs.classId) : null,
        classroomName: cs ? `Grade ${cs.gradeLevel} - ${cs.section}` : null,
        gradeLevel: cs?.gradeLevel ? Number(cs.gradeLevel) : null,
        subjectId: cs?.subjectId ? Number(cs.subjectId) : null,
        subjectName: cs?.subjectName ? String(cs.subjectName) : null,
        quarter,
        beforeState,
        afterState,
        diff: { from: beforeState?.status ?? null, to: status },
        status: "success",
        ipAddress: clientMeta?.ipAddress ?? null,
        userAgent: clientMeta?.userAgent ?? null,
      }, connection);
    } catch (auditErr) {
      console.error("[ActivityAudit] Failed to record single attendance audit log:", auditErr);
    }
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
