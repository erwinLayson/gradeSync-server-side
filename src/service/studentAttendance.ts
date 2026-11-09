import StudentAttendanceModel from "../model/studentAttendance.js";
import ClassDailyAttendanceModel from "../model/classDailyAttendance.js";
import ClassSubjectSubmissionModel from "../model/classSubjectSubmission.js";
import StudentRecordModel from "../model/studentRecord.js";

import type { PoolConnection } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../middleware/errors.js";
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
    isSubmitted?: boolean | undefined;
    isFrozen?: boolean | undefined;
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
    isSubjectSubmitted?: boolean | undefined;
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

    const recordModel = new StudentRecordModel(connection);
    const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
    if (activeSchoolYearId) {
      const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
      const submission = await classSubjectSubmissionModel.getSubmission(
        classSubjectId,
        quarter,
        activeSchoolYearId
      );
      if (submission?.status === "submitted") {
        throw new ForbiddenError(
          `Quarter ${quarter} attendance for this class subject has already been submitted. Submit an Amendment Request to modify an individual student's attendance.`
        );
      }
    }

    const entryEnrollmentIds = entries.map((e) => e.enrollmentId);
    if (entryEnrollmentIds.length > 0) {
      const records = await recordModel.getRecordsByEnrollmentIds(entryEnrollmentIds);
      const recordIds = records.map((r) => r.id);
      const subjectRows = await recordModel.getSubjectRowsByRecordIds(recordIds);
      const classSubject = await recordModel.getClassSubjectById(classSubjectId);
      if (classSubject) {
        const submittedEnrollmentIds = new Set<number>();
        for (const row of subjectRows) {
          if (
            row.subjectName.toLowerCase() === classSubject.subjectName.toLowerCase() ||
            row.subjectCode.toLowerCase() === classSubject.subjectCode.toLowerCase()
          ) {
            const col = quarter === 1 ? row.q1 : quarter === 2 ? row.q2 : quarter === 3 ? row.q3 : row.q4;
            if (col !== null && col !== undefined) {
              const rec = records.find((r) => r.id === row.recordId);
              if (rec) submittedEnrollmentIds.add(rec.enrollmentId);
            }
          }
        }

        if (submittedEnrollmentIds.size > 0) {
          const studentAttendanceModelTemp = new StudentAttendanceModel(connection);
          const existingAtt = await studentAttendanceModelTemp.getAttendanceByClassSubjectAndDate(classSubjectId, date);
          const existingStatusByEnrollment = new Map(existingAtt.map((a) => [a.enrollmentId, a.status]));

          for (const entry of entries) {
            if (submittedEnrollmentIds.has(entry.enrollmentId)) {
              const existingStatus = existingStatusByEnrollment.get(entry.enrollmentId);
              if (existingStatus && existingStatus !== entry.status) {
                throw new ForbiddenError(
                  `Quarter ${quarter} attendance for this student has already been submitted. Submit an Amendment Request to modify their attendance.`
                );
              }
            }
          }
        }
      }
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

        let isSubjectSubmitted = false;
        const submittedEnrollmentIds = new Set<number>();
        const recordModel = new StudentRecordModel(connection);
        const resolvedSchoolYearId = schoolYearId ?? await recordModel.getActiveSchoolYearId();

        if (resolvedSchoolYearId && quarter !== undefined) {
            const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
            const submission = await classSubjectSubmissionModel.getSubmission(classSubjectId, quarter, resolvedSchoolYearId);
            isSubjectSubmitted = submission?.status === "submitted";

            const enrollmentIds = students.map((s) => Number(s.enrollmentId));
            if (enrollmentIds.length > 0) {
                const records = await recordModel.getRecordsByEnrollmentIds(enrollmentIds);
                const recordIds = records.map((r) => r.id);
                const subjectRows = await recordModel.getSubjectRowsByRecordIds(recordIds);
                const classSubject = await recordModel.getClassSubjectById(classSubjectId);
                if (classSubject) {
                    for (const row of subjectRows) {
                        if (
                            row.subjectName.toLowerCase() === classSubject.subjectName.toLowerCase() ||
                            row.subjectCode.toLowerCase() === classSubject.subjectCode.toLowerCase()
                        ) {
                            const col = quarter === 1 ? row.q1 : quarter === 2 ? row.q2 : quarter === 3 ? row.q3 : row.q4;
                            if (col !== null && col !== undefined) {
                                const rec = records.find((r) => r.id === row.recordId);
                                if (rec) submittedEnrollmentIds.add(rec.enrollmentId);
                            }
                        }
                    }
                }
            }
        }

        return {
            classSubjectId,
            isSubjectSubmitted,
            students: students.map((student) => {
                const isStudentSubmitted = isSubjectSubmitted || submittedEnrollmentIds.has(Number(student.enrollmentId));
                return {
                    enrollmentId: Number(student.enrollmentId),
                    studentId: Number(student.studentId),
                    studentLrn: student.studentLrn,
                    fullname: student.fullname,
                    firstname: student.firstname,
                    middlename: student.middlename ?? null,
                    lastname: student.lastname,
                    suffix: student.suffix ?? null,
                    isSubmitted: isStudentSubmitted,
                    isFrozen: isStudentSubmitted,
                };
            }),
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

// ==================== Admin Teacher Attendance Monitoring ====================

export interface AttendanceMonitoringQuery {
  schoolYearId?: number | undefined;
  month?: number | undefined;
  year?: number | undefined;
  classId?: number | undefined;
  gradeLevel?: number | undefined;
  subjectId?: number | undefined;
  facultyId?: number | undefined;
}

export interface MonitoringDateInfo {
  date: string;
  dayNumber: number;
  dayOfWeek: number;
  dayAbbr: string;
  isWeekend: boolean;
}

export interface MonitoringSubjectCell {
  hasSession: boolean;
  presentCount: number;
  totalEnrolled: number;
  attendanceRate: number;
  statusType: "submitted" | "missing" | "weekend" | "no_schedule";
  sessionCount: number;
  classSubjectId: number;
  date: string;
}

export interface MonitoringSubjectRow {
  classSubjectId: number;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  facultyId: number;
  teacherName: string;
  attendanceByDate: Record<string, MonitoringSubjectCell>;
}

export interface MonitoringClassroomGroup {
  classId: number;
  section: string;
  gradeLevel: number;
  totalEnrolled: number;
  subjects: MonitoringSubjectRow[];
}

export interface MonitoringSummaryStats {
  totalClassrooms: number;
  totalSubjects: number;
  totalPresent: number;
  totalAbsent: number;
  overallAttendanceRate: number | null;
}

export interface AttendanceMonitoringResult {
  schoolYear: {
    id: number;
    startYear: string;
    endYear: string;
    isActive: boolean;
  } | null;
  selectedMonth: number;
  selectedYear: number;
  summary: MonitoringSummaryStats;
  dates: MonitoringDateInfo[];
  classrooms: MonitoringClassroomGroup[];
}

export interface AttendanceSessionDetailResult {
  sessionInfo: {
    classSubjectId: number;
    classId: number;
    classroomName: string;
    section: string;
    gradeLevel: number;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    facultyId: number;
    teacherName: string;
    date: string;
    submissionTimestamp: string | null;
    quarter: number | null;
    status: string;
  };
  summary: {
    totalEnrolled: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendanceRate: number;
  };
  students: {
    studentId: number;
    lrn: string;
    studentName: string;
    status: AttendanceStatus | "unmarked";
    recordedAt: string | null;
  }[];
}

export async function getTeacherAttendanceMonitoringService(
  query: AttendanceMonitoringQuery = {},
  conn?: PoolConnection,
): Promise<AttendanceMonitoringResult> {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  try {
    // 1. Resolve school year
    let schoolYearRow: { id: number; startYear: string; endYear: string; isActive: number } | null = null;
    if (query.schoolYearId !== undefined) {
      const [syRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id, startYear, endYear, isActive FROM schoolyear WHERE id = ? LIMIT 1",
        [query.schoolYearId],
      );
      if (syRows.length > 0 && syRows[0]) {
        schoolYearRow = syRows[0] as { id: number; startYear: string; endYear: string; isActive: number };
      }
    }
    if (!schoolYearRow) {
      const [syRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id, startYear, endYear, isActive FROM schoolyear WHERE isActive = 1 LIMIT 1",
      );
      if (syRows.length > 0 && syRows[0]) {
        schoolYearRow = syRows[0] as { id: number; startYear: string; endYear: string; isActive: number };
      } else {
        const [fallbackRows] = await connection.execute<RowDataPacket[]>(
          "SELECT id, startYear, endYear, isActive FROM schoolyear ORDER BY startYear DESC LIMIT 1",
        );
        if (fallbackRows.length > 0 && fallbackRows[0]) {
          schoolYearRow = fallbackRows[0] as { id: number; startYear: string; endYear: string; isActive: number };
        }
      }
    }

    const schoolYearId = schoolYearRow ? Number(schoolYearRow.id) : 0;

    // 2. Resolve month and year
    const now = new Date();
    let month = query.month !== undefined ? Number(query.month) : (now.getMonth() + 1);
    if (Number.isNaN(month) || month < 1 || month > 12) {
      throw new BadRequestError("month must be a valid number between 1 and 12");
    }

    let year = query.year !== undefined ? Number(query.year) : NaN;
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      if (schoolYearRow) {
        const startY = parseInt(schoolYearRow.startYear, 10);
        const endY = parseInt(schoolYearRow.endYear, 10);
        year = month >= 8
          ? (Number.isNaN(startY) ? now.getFullYear() : startY)
          : (Number.isNaN(endY) ? now.getFullYear() : endY);
      } else {
        year = now.getFullYear();
      }
    }

    // 3. Dynamic dates for the selected month
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const dates: MonitoringDateInfo[] = [];
    const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates.push({
        date: dateStr,
        dayNumber: day,
        dayOfWeek,
        dayAbbr: DAY_NAMES[dayOfWeek] ?? "DAY",
        isWeekend,
      });
    }

    // 4. Retrieve data from database
    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const [enrollmentMap, classSubjectRows, aggregates] = await Promise.all([
      studentAttendanceModel.getMonitoringEnrollmentCounts(schoolYearId),
      studentAttendanceModel.getMonitoringClassSubjects({
        classId: query.classId,
        gradeLevel: query.gradeLevel,
        subjectId: query.subjectId,
        facultyId: query.facultyId,
      }),
      studentAttendanceModel.getMonitoringAttendanceAggregates(schoolYearId, startDate, endDate, {
        classId: query.classId,
        gradeLevel: query.gradeLevel,
        subjectId: query.subjectId,
        facultyId: query.facultyId,
      }),
    ]);

    // 5. Index aggregates
    const aggMap = new Map<string, { presentCount: number; absentCount: number; totalRecorded: number }>();
    let totalPresent = 0;
    let totalAbsent = 0;

    for (const agg of aggregates) {
      aggMap.set(`${agg.classSubjectId}_${agg.dateStr}`, {
        presentCount: Number(agg.presentCount),
        absentCount: Number(agg.absentCount),
        totalRecorded: Number(agg.totalRecorded),
      });
      totalPresent += Number(agg.presentCount);
      totalAbsent += Number(agg.absentCount);
    }

    const totalStudentsRecorded = totalPresent + totalAbsent;
    const overallAttendanceRate = totalStudentsRecorded > 0
      ? Math.round((totalPresent / totalStudentsRecorded) * 1000) / 10
      : null;

    // 6. Group by classroom hierarchically
    const classroomMap = new Map<number, MonitoringClassroomGroup>();
    for (const row of classSubjectRows) {
      let group = classroomMap.get(row.classId);
      if (!group) {
        const totalEnrolled = enrollmentMap.get(row.classId) ?? 0;
        group = {
          classId: row.classId,
          section: row.section,
          gradeLevel: row.gradeLevel,
          totalEnrolled,
          subjects: [],
        };
        classroomMap.set(row.classId, group);
      }

      const attendanceByDate: Record<string, MonitoringSubjectCell> = {};
      const classEnrolled = group.totalEnrolled;

      for (const d of dates) {
        if (d.isWeekend) {
          attendanceByDate[d.date] = {
            hasSession: false,
            presentCount: 0,
            totalEnrolled: classEnrolled,
            attendanceRate: 0,
            statusType: "weekend",
            sessionCount: 0,
            classSubjectId: row.classSubjectId,
            date: d.date,
          };
        } else {
          const agg = aggMap.get(`${row.classSubjectId}_${d.date}`);
          if (agg) {
            const pCount = agg.presentCount;
            const enrolled = classEnrolled > 0 ? classEnrolled : agg.totalRecorded;
            const rate = enrolled > 0 ? Math.round((pCount / enrolled) * 1000) / 10 : 0;
            attendanceByDate[d.date] = {
              hasSession: true,
              presentCount: pCount,
              totalEnrolled: enrolled,
              attendanceRate: rate,
              statusType: "submitted",
              sessionCount: 1,
              classSubjectId: row.classSubjectId,
              date: d.date,
            };
          } else {
            attendanceByDate[d.date] = {
              hasSession: false,
              presentCount: 0,
              totalEnrolled: classEnrolled,
              attendanceRate: 0,
              statusType: "missing",
              sessionCount: 0,
              classSubjectId: row.classSubjectId,
              date: d.date,
            };
          }
        }
      }

      group.subjects.push({
        classSubjectId: row.classSubjectId,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        subjectCode: row.subjectCode,
        facultyId: row.facultyId,
        teacherName: `${row.teacherLastname}, ${row.teacherFirstname}`,
        attendanceByDate,
      });
    }

    return {
      schoolYear: schoolYearRow
        ? {
            id: Number(schoolYearRow.id),
            startYear: String(schoolYearRow.startYear),
            endYear: String(schoolYearRow.endYear),
            isActive: Boolean(schoolYearRow.isActive),
          }
        : null,
      selectedMonth: month,
      selectedYear: year,
      summary: {
        totalClassrooms: classroomMap.size,
        totalSubjects: classSubjectRows.length,
        totalPresent,
        totalAbsent,
        overallAttendanceRate,
      },
      dates,
      classrooms: Array.from(classroomMap.values()),
    };
  } finally {
    if (ownConn) connection.release();
  }
}

export async function getAttendanceSessionDetailService(
  classSubjectId: number,
  date: string,
  schoolYearId?: number,
  conn?: PoolConnection,
): Promise<AttendanceSessionDetailResult> {
  const pool = getDBPoolConnection();
  const connection = conn ?? await pool.getConnection();
  const ownConn = !conn;
  try {
    if (!isValidDate(date)) {
      throw new BadRequestError("date must be a valid YYYY-MM-DD string");
    }
    const studentAttendanceModel = new StudentAttendanceModel(connection);
    const sessionRow = await studentAttendanceModel.getMonitoringSessionDetail(classSubjectId, date);
    if (!sessionRow) {
      throw new NotFoundError(`Class subject #${classSubjectId} not found`, 404);
    }

    const students = await studentAttendanceModel.getMonitoringSessionStudents(classSubjectId, date, schoolYearId);

    const presentCount = students.filter((s) => s.attendanceStatus === "present").length;
    const absentCount = students.filter((s) => s.attendanceStatus === "absent").length;
    const totalEnrolled = students.length;
    const rate = totalEnrolled > 0 ? Math.round((presentCount / totalEnrolled) * 1000) / 10 : 0;

    let formattedTimestamp: string | null = null;
    if (sessionRow.submissionTimestamp) {
      const ts = new Date(sessionRow.submissionTimestamp);
      formattedTimestamp = !Number.isNaN(ts.getTime()) ? ts.toISOString() : String(sessionRow.submissionTimestamp);
    }

    return {
      sessionInfo: {
        classSubjectId: Number(sessionRow.classSubjectId),
        classId: Number(sessionRow.classId),
        classroomName: `Grade ${sessionRow.gradeLevel} - ${sessionRow.section}`,
        section: sessionRow.section,
        gradeLevel: Number(sessionRow.gradeLevel),
        subjectId: Number(sessionRow.subjectId),
        subjectName: sessionRow.subjectName,
        subjectCode: sessionRow.subjectCode,
        facultyId: Number(sessionRow.facultyId),
        teacherName: `${sessionRow.teacherLastname}, ${sessionRow.teacherFirstname}`,
        date,
        submissionTimestamp: formattedTimestamp,
        quarter: sessionRow.quarter ? Number(sessionRow.quarter) : null,
        status: "Submitted",
      },
      summary: {
        totalEnrolled,
        present: presentCount,
        absent: absentCount,
        late: 0,
        excused: 0,
        attendanceRate: rate,
      },
      students: students.map((s) => ({
        studentId: Number(s.studentId),
        lrn: s.lrn,
        studentName: `${s.lastname}, ${s.firstname}${s.middlename ? ` ${s.middlename}` : ""}${s.suffix ? ` ${s.suffix}` : ""}`,
        status: (s.attendanceStatus as AttendanceStatus) ?? "unmarked",
        recordedAt: s.recordedAt ? String(s.recordedAt) : null,
      })),
    };
  } finally {
    if (ownConn) connection.release();
  }
}
