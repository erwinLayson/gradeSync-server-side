import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type { StudentAttendanceProps, AttendanceRecord, AttendanceInput, AttendanceStatus } from "../constant/grade.js";

export interface AttendanceRosterRow {
  enrollmentId: number;
  studentId: number;
  studentLrn: string;
  fullname: string;
  firstname?: string;
  middlename?: string | null;
  lastname?: string;
  suffix?: string | null;
}

// One cell of the class-wide attendance matrix (one student on one date).
export interface AttendanceRangeRow {
  enrollmentId: number;
  status: AttendanceStatus | null;
  date: string | Date;
  quarter: number | null;
}

// Optional slicing for the matrix read: every field is independent, and they
// combine (school year via the enrollment, quarter and date range on the row).
// (`| undefined` is required alongside `?` because the compiler runs with
// exactOptionalPropertyTypes: callers build the object from nullable query
// params and pass the field explicitly as undefined to mean "no filter".)
export interface AttendanceRangeFilters {
  schoolYearId?: number | undefined;
  quarter?: number | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface MonitoringClassSubjectRow {
  classId: number;
  section: string;
  gradeLevel: number;
  classSubjectId: number;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  facultyId: number;
  teacherFirstname: string;
  teacherLastname: string;
}

export interface MonitoringEnrollmentCountRow {
  classId: number;
  enrolledCount: number;
}

export interface MonitoringAttendanceAggregateRow {
  classSubjectId: number;
  dateStr: string;
  totalRecorded: number;
  presentCount: number;
  absentCount: number;
  firstCreatedAt: string | Date | null;
  lastCreatedAt: string | Date | null;
}

export interface MonitoringSessionDetailRow {
  classSubjectId: number;
  classId: number;
  section: string;
  gradeLevel: number;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  facultyId: number;
  teacherFirstname: string;
  teacherLastname: string;
  submissionTimestamp: string | Date | null;
  quarter: number | null;
}

export interface MonitoringStudentAttendanceRow {
  enrollmentId: number;
  studentId: number;
  lrn: string;
  firstname: string;
  middlename: string | null;
  lastname: string;
  suffix: string | null;
  attendanceStatus: AttendanceStatus | null;
  recordedAt: string | Date | null;
}

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
  // pre-fill the faculty's daily attendance sheet (one row per student).
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
  // faculty-chosen quarter (1-4) is stored with every row of the day so the
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

  // The roster rows of the class-wide attendance matrix: every active student
  // enrolled in the SUBJECT's class, oldest name first. When schoolYearId is
  // given, only that school year's enrollments are returned — so switching year
  // can never mix another year's students (or their attendance) into the grid.
  async getAttendanceRosterByClassSubject(
    classSubjectId: number,
    schoolYearId?: number,
  ): Promise<AttendanceRosterRow[]> {
    try {
      let query = `
        SELECT
          e.id AS enrollmentId,
          s.id AS studentId,
          s.lrn AS studentLrn,
          s.firstname,
          s.middlename,
          s.lastname,
          s.suffix,
          CONCAT(
            s.lastname,
            ', ',
            s.firstname,
            IF(s.middlename IS NOT NULL AND s.middlename != '', CONCAT(' ', s.middlename), ''),
            IF(s.suffix IS NOT NULL AND s.suffix != '', CONCAT(' ', s.suffix), '')
          ) AS fullname
        FROM class_subjects cs
        JOIN enrollments e ON e.classId = cs.classId
        JOIN students s ON s.id = e.studentId
        WHERE cs.id = ?
          -- Hide soft-deleted students, exactly like the other attendance reads
          AND (s.status IS NULL OR s.status <> 'inactive')
          AND e.status IN ('enrolled', 'completed')
      `;
      const params: (string | number)[] = [classSubjectId];
      if (schoolYearId !== undefined) {
        query += " AND e.schoolYearId = ?";
        params.push(schoolYearId);
      }
      query += " ORDER BY s.lastname ASC, s.firstname ASC, s.id ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as AttendanceRosterRow[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch attendance roster", 500, err);
    }
  }

  // Every recorded cell of the class-wide attendance matrix for ONE SUBJECT,
  // scoped by the supplied filters. The matrix columns are the distinct dates
  // returned here, so a faculty only ever sees dates that actually have records
  // for the selected school year / quarter / date range.
  async getAttendanceRangeByClassSubject(
    classSubjectId: number,
    filters: AttendanceRangeFilters = {},
  ): Promise<AttendanceRangeRow[]> {
    try {
      let query = `
        SELECT sa.enrollmentId, sa.status, sa.date, sa.quarter
        FROM student_attendance sa
        JOIN enrollments e ON e.id = sa.enrollmentId
        JOIN students s ON s.id = e.studentId
        WHERE sa.classSubjectId = ?
          AND (s.status IS NULL OR s.status <> 'inactive')
          AND e.status IN ('enrolled', 'completed')
      `;
      const params: (string | number)[] = [classSubjectId];

      if (filters.schoolYearId !== undefined) {
        query += " AND e.schoolYearId = ?";
        params.push(filters.schoolYearId);
      }
      if (filters.quarter !== undefined) {
        query += " AND sa.quarter = ?";
        params.push(filters.quarter);
      }
      if (filters.dateFrom !== undefined) {
        query += " AND sa.date >= ?";
        params.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        query += " AND sa.date <= ?";
        params.push(filters.dateTo);
      }
      query += " ORDER BY sa.date DESC, s.lastname ASC, s.firstname ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as AttendanceRangeRow[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch attendance range", 500, err);
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
      query += " ORDER BY sa.date DESC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as AttendanceRecord[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch attendance history", 500, err);
    }
  }

  // Retrieve active classrooms and class subjects for the admin monitoring matrix
  async getMonitoringClassSubjects(filters: {
    classId?: number | undefined;
    gradeLevel?: number | undefined;
    subjectId?: number | undefined;
    facultyId?: number | undefined;
  } = {}): Promise<MonitoringClassSubjectRow[]> {
    try {
      let query = `
        SELECT
          c.id AS classId,
          c.section,
          c.gradeLevel,
          cs.id AS classSubjectId,
          s.id AS subjectId,
          s.name AS subjectName,
          s.code AS subjectCode,
          f.id AS facultyId,
          f.firstname AS teacherFirstname,
          f.lastname AS teacherLastname
        FROM classrooms c
        JOIN class_subjects cs ON cs.classId = c.id
        JOIN subjects s ON s.id = cs.subjectId
        JOIN faculties f ON f.id = cs.facultyId
        WHERE c.status = 'active'
      `;
      const params: (string | number)[] = [];

      if (filters.classId !== undefined) {
        query += " AND c.id = ?";
        params.push(filters.classId);
      }
      if (filters.gradeLevel !== undefined) {
        query += " AND c.gradeLevel = ?";
        params.push(filters.gradeLevel);
      }
      if (filters.subjectId !== undefined) {
        query += " AND s.id = ?";
        params.push(filters.subjectId);
      }
      if (filters.facultyId !== undefined) {
        query += " AND f.id = ?";
        params.push(filters.facultyId);
      }

      query += " ORDER BY c.gradeLevel ASC, c.section ASC, s.name ASC, cs.id ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as MonitoringClassSubjectRow[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch monitoring class subjects", 500, err);
    }
  }

  // Count active enrolled students per classroom for a specific school year
  async getMonitoringEnrollmentCounts(schoolYearId: number): Promise<Map<number, number>> {
    try {
      const query = `
        SELECT
          e.classId,
          COUNT(DISTINCT e.id) AS enrolledCount
        FROM enrollments e
        JOIN students s ON s.id = e.studentId
        WHERE e.schoolYearId = ?
          AND e.status IN ('enrolled', 'completed')
          AND (s.status IS NULL OR s.status <> 'inactive')
        GROUP BY e.classId
      `;
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolYearId]);
      const map = new Map<number, number>();
      for (const row of rows as (RowDataPacket & MonitoringEnrollmentCountRow)[]) {
        map.set(Number(row.classId), Number(row.enrolledCount));
      }
      return map;
    } catch (err) {
      throw new InternalServerError("Failed to fetch monitoring enrollment counts", 500, err);
    }
  }

  // Aggregate attendance numbers per classSubject and date within the selected date range
  async getMonitoringAttendanceAggregates(
    schoolYearId: number,
    startDate: string,
    endDate: string,
    filters: {
      classId?: number | undefined;
      gradeLevel?: number | undefined;
      subjectId?: number | undefined;
      facultyId?: number | undefined;
    } = {},
  ): Promise<MonitoringAttendanceAggregateRow[]> {
    try {
      let query = `
        SELECT
          sa.classSubjectId,
          DATE_FORMAT(sa.date, '%Y-%m-%d') AS dateStr,
          COUNT(*) AS totalRecorded,
          COALESCE(SUM(sa.status = 'present'), 0) AS presentCount,
          COALESCE(SUM(sa.status = 'absent'), 0) AS absentCount,
          MIN(sa.created_at) AS firstCreatedAt,
          MAX(sa.created_at) AS lastCreatedAt
        FROM student_attendance sa
        JOIN class_subjects cs ON cs.id = sa.classSubjectId
        JOIN classrooms c ON c.id = cs.classId
        JOIN enrollments e ON e.id = sa.enrollmentId
        WHERE e.schoolYearId = ?
          AND sa.date >= ? AND sa.date <= ?
          AND c.status = 'active'
      `;
      const params: (string | number)[] = [schoolYearId, startDate, endDate];

      if (filters.classId !== undefined) {
        query += " AND c.id = ?";
        params.push(filters.classId);
      }
      if (filters.gradeLevel !== undefined) {
        query += " AND c.gradeLevel = ?";
        params.push(filters.gradeLevel);
      }
      if (filters.subjectId !== undefined) {
        query += " AND cs.subjectId = ?";
        params.push(filters.subjectId);
      }
      if (filters.facultyId !== undefined) {
        query += " AND cs.facultyId = ?";
        params.push(filters.facultyId);
      }

      query += " GROUP BY sa.classSubjectId, sa.date ORDER BY sa.date ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as MonitoringAttendanceAggregateRow[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch monitoring attendance aggregates", 500, err);
    }
  }

  // Fetch session metadata for a clicked cell
  async getMonitoringSessionDetail(
    classSubjectId: number,
    date: string,
  ): Promise<MonitoringSessionDetailRow | null> {
    try {
      const query = `
        SELECT
          cs.id AS classSubjectId,
          c.id AS classId,
          c.section,
          c.gradeLevel,
          s.id AS subjectId,
          s.name AS subjectName,
          s.code AS subjectCode,
          f.id AS facultyId,
          f.firstname AS teacherFirstname,
          f.lastname AS teacherLastname,
          MIN(sa.created_at) AS submissionTimestamp,
          MIN(sa.quarter) AS quarter
        FROM class_subjects cs
        JOIN classrooms c ON c.id = cs.classId
        JOIN subjects s ON s.id = cs.subjectId
        JOIN faculties f ON f.id = cs.facultyId
        LEFT JOIN student_attendance sa ON sa.classSubjectId = cs.id AND sa.date = ?
        WHERE cs.id = ?
        GROUP BY cs.id, c.id, c.section, c.gradeLevel, s.id, s.name, s.code, f.id, f.firstname, f.lastname
        LIMIT 1
      `;
      const [rows] = await this.connection.execute<RowDataPacket[]>(query, [date, classSubjectId]);
      if (rows.length === 0 || rows[0] === undefined) return null;
      return rows[0] as MonitoringSessionDetailRow;
    } catch (err) {
      throw new InternalServerError("Failed to fetch session detail", 500, err);
    }
  }

  // Fetch all enrolled students in the class with their recorded status for that date
  async getMonitoringSessionStudents(
    classSubjectId: number,
    date: string,
    schoolYearId?: number,
  ): Promise<MonitoringStudentAttendanceRow[]> {
    try {
      let query = `
        SELECT
          e.id AS enrollmentId,
          s.id AS studentId,
          s.lrn,
          s.firstname,
          s.middlename,
          s.lastname,
          s.suffix,
          sa.status AS attendanceStatus,
          sa.created_at AS recordedAt
        FROM enrollments e
        JOIN students s ON s.id = e.studentId
        JOIN class_subjects cs ON cs.classId = e.classId
        LEFT JOIN student_attendance sa ON sa.enrollmentId = e.id AND sa.classSubjectId = cs.id AND sa.date = ?
        WHERE cs.id = ?
          AND (s.status IS NULL OR s.status <> 'inactive')
          AND e.status IN ('enrolled', 'completed')
      `;
      const params: (string | number)[] = [date, classSubjectId];

      if (schoolYearId !== undefined) {
        query += " AND e.schoolYearId = ?";
        params.push(schoolYearId);
      }

      query += " ORDER BY s.lastname ASC, s.firstname ASC, s.id ASC";

      const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
      return rows as MonitoringStudentAttendanceRow[];
    } catch (err) {
      throw new InternalServerError("Failed to fetch session students", 500, err);
    }
  }
}
