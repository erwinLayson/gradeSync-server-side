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
    async getStudentCount(schoolYearId?: number): Promise<number> {
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

    // Teachers / active classrooms are not school-year scoped.
    async getTeacherCount(): Promise<number> {
        try {
            const query = `SELECT COUNT(*) AS count FROM teachers`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch teacher count", 500, err);
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

    // Overall average score percentage across every graded assessment.
    async getAverageGrade(schoolYearId?: number): Promise<number | null> {
        try {
            const query = `
                SELECT ROUND(AVG((ss.score / a.maxScore) * 100), 2) AS average
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                ${schoolYearId !== undefined
                    ? "JOIN enrollments e ON e.id = ss.enrollmentId AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')"
                    : ""}
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            const average = rows[0]?.average;
            return average === null || average === undefined ? null : Number(average);
        } catch (err) {
            throw new InternalServerError("Failed to fetch average grade", 500, err);
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

    // Per-enrollment average percentages, used to derive passing rate.
    async getEnrollmentAverages(schoolYearId?: number): Promise<number[]> {
        try {
            const query = `
                SELECT ROUND(AVG((ss.score / a.maxScore) * 100), 2) AS average
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                JOIN enrollments e ON e.id = ss.enrollmentId AND e.status IN ('enrolled', 'completed')
                ${schoolYearId !== undefined ? "WHERE e.schoolYearId = ?" : ""}
                GROUP BY ss.enrollmentId
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows.map((row) => Number(row.average));
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollment averages", 500, err);
        }
    }

    // Average score percentage per subject.
    async getSubjectPerformance(schoolYearId?: number): Promise<{ subject: string; score: number }[]> {
        try {
            const query = `
                SELECT
                    s.name AS subject,
                    ROUND(AVG((ss.score / a.maxScore) * 100), 1) AS score
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                JOIN class_subjects cs ON cs.id = a.classSubjectId
                JOIN subjects s ON s.id = cs.subjectId
                ${schoolYearId !== undefined
                    ? "JOIN enrollments e ON e.id = ss.enrollmentId AND e.schoolYearId = ? AND e.status IN ('enrolled', 'completed')"
                    : ""}
                ${schoolYearId === undefined ? "JOIN enrollments e ON e.id = ss.enrollmentId AND e.status IN ('enrolled', 'completed')" : ""}
                GROUP BY s.id, s.name
                ORDER BY score DESC
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows as { subject: string; score: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subject performance", 500, err);
        }
    }

    // Top performing students by average score percentage.
    async getTopPerformers(schoolYearId?: number): Promise<{ studentId: number; fullname: string; section: string; grade: number }[]> {
        try {
            const query = `
                SELECT
                    st.id AS studentId,
                    CONCAT_WS(" ", st.firstname, st.middlename, st.lastname, IF(st.suffix IS NOT NULL, CONCAT(" ", st.suffix), "")) AS fullname,
                    c.section,
                    ROUND(AVG((ss.score / a.maxScore) * 100), 1) AS grade
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                JOIN enrollments e ON e.id = ss.enrollmentId AND e.status IN ('enrolled', 'completed')
                JOIN students st ON st.id = e.studentId
                JOIN classrooms c ON c.id = e.classId
                ${schoolYearId !== undefined ? "WHERE e.schoolYearId = ?" : ""}
                GROUP BY st.id, st.firstname, st.middlename, st.lastname, st.suffix, c.section
                ORDER BY grade DESC
                LIMIT 5
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return rows as { studentId: number; fullname: string; section: string; grade: number }[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch top performers", 500, err);
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
