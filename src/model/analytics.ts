import { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

// One month of attendance data (present rate).
export interface AttendanceTrendRow {
    month: string;       // "2026-08"
    present: number;
    total: number;
    rate: number;        // 0-100, rounded to 1 decimal
}

export default class Analytics {
    constructor(private connection: PoolConnection) {}

    // Total non-deleted students (same status rule used everywhere else).
    async getStudentCount(_schoolYearId?: number): Promise<number> {
        try {
            const query = `
                SELECT COUNT(DISTINCT s.id) AS count
                FROM students s
                WHERE (s.status IS NULL OR s.status <> "inactive")
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch student count", 500, err);
        }
    }

    // Faculties / active classrooms are not school-year scoped.
    async getFacultyCount(): Promise<number> {
        try {
            const query = `SELECT COUNT(*) AS count FROM faculties`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch faculty count", 500, err);
        }
    }

    async getClassroomCount(): Promise<number> {
        try {
            const query = `SELECT COUNT(*) AS count FROM classrooms`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch classroom count", 500, err);
        }
    }

    // Enrolled students per grade level for the school year.
    async getEnrollmentByGradeLevel(schoolYearId?: number): Promise<{ gradeLevel: number; count: number }[]> {
        try {
            const query = `
                SELECT
                    c.gradeLevel,
                    COUNT(DISTINCT e.studentId) AS count
                FROM enrollments e
                JOIN classrooms c ON c.id = e.classId
                JOIN students s ON s.id = e.studentId
                    AND (s.status IS NULL OR s.status <> "inactive")
                WHERE e.status IN ('enrolled', 'completed')
                ${schoolYearId !== undefined ? "AND e.schoolYearId = ?" : ""}
                GROUP BY c.gradeLevel
                ORDER BY c.gradeLevel
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows as { gradeLevel: number; count: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment by grade level", 500, err);
        }
    }

    // Class subjects worth evaluating for the school-wide grade aggregates: those
    // with at least one assessment or one attendance record. Filtering here keeps
    // the aggregation from running the grade engine on completely ungraded
    // subjects. (Attendance is included because a subject can produce a grade
    // from attendance alone when its attendance weight is non-zero.)
    //
    // The grade itself is NEVER computed here: grade aggregates come from the
    // central engine — see service/gradeAggregates.ts.
    async getGradedClassSubjects(schoolYearId?: number): Promise<{ classSubjectId: number; subjectName: string }[]> {
        try {
            const query = `
                SELECT DISTINCT cs.id AS classSubjectId, s.name AS subjectName
                FROM class_subjects cs
                JOIN subjects s ON s.id = cs.subjectId
                JOIN classrooms c ON c.id = cs.classId
                JOIN enrollments e ON e.classId = c.id AND e.status IN ('enrolled', 'completed')
                WHERE (c.status IS NULL OR c.status <> 'inactive')
                ${schoolYearId !== undefined ? "AND e.schoolYearId = ?" : ""}
                AND (
                    EXISTS (SELECT 1 FROM assessments a WHERE a.classSubjectId = cs.id)
                    OR EXISTS (SELECT 1 FROM student_attendance sa WHERE sa.classSubjectId = cs.id)
                )
                ORDER BY s.name
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows.map((row) => ({
                classSubjectId: Number(row.classSubjectId),
                subjectName: String(row.subjectName)
            }));
        } catch (err) {
            throw new InternalServerError("Failed to fetch graded class subjects", 500, err);
        }
    }

    // School years that have at least one enrollment (used to pick the default).
    async getSchoolYearsWithEnrollments(): Promise<number[]> {
        try {
            const query = `                SELECT DISTINCT e.schoolYearId AS schoolYearId FROM enrollments e WHERE e.status IN ('enrolled', 'completed') ORDER BY e.schoolYearId`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.map((row) => Number(row.schoolYearId));
        } catch (err) {
            throw new InternalServerError("Failed to fetch school years with enrollments", 500, err);
        }
    }

    // Total distinct students enrolled per school year (all years, newest last).
    async getEnrollmentPerSchoolYear(): Promise<{ schoolYearId: number; startYear: string; endYear: string; count: number }[]> {
        try {
            const query = `
                SELECT
                    sy.id AS schoolYearId,
                    sy.startYear,
                    sy.endYear,
                    COUNT(DISTINCT e.studentId) AS count
                FROM schoolyear sy
                LEFT JOIN enrollments e ON e.schoolYearId = sy.id AND e.status IN ('enrolled', 'completed')
                GROUP BY sy.id, sy.startYear, sy.endYear
                ORDER BY sy.startYear
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.map((row) => ({
                schoolYearId: Number(row.schoolYearId),
                startYear: String(row.startYear),
                endYear: String(row.endYear),
                count: Number(row.count)
            }));
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment per school year", 500, err);
        }
    }

    // Enrolled students by sex for the school year (or all years when no filter).
    async getEnrollmentBySex(schoolYearId?: number): Promise<{ sex: string; count: number }[]> {
        try {
            const query = `
                SELECT
                    s.sex,
                    COUNT(DISTINCT e.studentId) AS count
                FROM enrollments e
                JOIN students s ON s.id = e.studentId
                    AND (s.status IS NULL OR s.status <> "inactive")
                WHERE e.status IN ('enrolled', 'completed')
                ${schoolYearId !== undefined ? "AND e.schoolYearId = ?" : ""}
                GROUP BY s.sex
                ORDER BY s.sex
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows.map((row) => ({ sex: String(row.sex), count: Number(row.count) }));
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment by sex", 500, err);
        }
    }

    // Today's overall attendance present rate (all subjects).
    async getAttendanceToday(schoolYearId?: number): Promise<{ total: number; present: number; rate: number | null }> {
        try {
            const query = `
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(sa.status = "present"), 0) AS present
                FROM student_attendance sa
                ${schoolYearId !== undefined
                    ? "JOIN enrollments e ON e.id = sa.enrollmentId AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')"
                    : ""}
                WHERE sa.date = CURDATE()
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            const total = Number(rows[0]?.total ?? 0);
            const present = Number(rows[0]?.present ?? 0);
            return {
                total,
                present,
                rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null
            };
        } catch (err) {
            throw new InternalServerError("Failed to fetch today's attendance", 500, err);
        }
    }

    // Distinct students newly enrolled within the last 7 days.
    async getNewStudentsThisWeek(schoolYearId?: number): Promise<number> {
        try {
            const query = `
                SELECT COUNT(DISTINCT e.studentId) AS count
                FROM enrollments e
                JOIN students s ON s.id = e.studentId
                    AND (s.status IS NULL OR s.status <> "inactive")
                WHERE e.status IN ('enrolled', 'completed')
                AND e.dateEnrolled >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                ${schoolYearId !== undefined ? "AND e.schoolYearId = ?" : ""}
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch new students this week", 500, err);
        }
    }

    // Total enrollment records (used with gradedEnrollments for pending grading).
    async getEnrollmentCount(schoolYearId?: number): Promise<number> {
        try {
            const query = `
                SELECT COUNT(*) AS count
                FROM enrollments e
                WHERE e.status IN ('enrolled', 'completed')
                ${schoolYearId !== undefined ? "AND e.schoolYearId = ?" : ""}
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment count", 500, err);
        }
    }

    // Monthly attendance present rate (per-subject attendance rows).
    async getAttendanceTrend(schoolYearId?: number): Promise<AttendanceTrendRow[]> {
        try {
            const query = `
                SELECT
                    DATE_FORMAT(sa.date, "%Y-%m") AS month,
                    SUM(sa.status = "present") AS present,
                    COUNT(*) AS total
                FROM student_attendance sa
                ${schoolYearId !== undefined
                    ? "JOIN enrollments e ON e.id = sa.enrollmentId AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')"
                    : ""}
                ${schoolYearId === undefined ? "JOIN enrollments e ON e.id = sa.enrollmentId AND e.status IN ('enrolled', 'completed')" : ""}
                GROUP BY DATE_FORMAT(sa.date, "%Y-%m")
                ORDER BY month
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows.map((row) => ({
                month: String(row.month),
                present: Number(row.present),
                total: Number(row.total),
                rate: row.total > 0 ? Math.round((Number(row.present) / Number(row.total)) * 1000) / 10 : 0
            }));
        } catch (err) {
            throw new InternalServerError("Failed to fetch attendance trend", 500, err);
        }
    }
}
