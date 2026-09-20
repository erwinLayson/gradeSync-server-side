import { PoolConnection, type RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type {
    DashboardSchoolYear,
    DashboardAcademicProgress,
    DashboardAttentionItem,
} from "../constant/dashboard.js";

export default class Dashboard {
    constructor(private connection: PoolConnection) {}

    async getActiveSchoolYear(): Promise<DashboardSchoolYear | null> {
        try {
            const query = "SELECT id, startYear, endYear FROM schoolyear WHERE isActive = 1 LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            if (rows.length === 0 || rows[0] === undefined) return null;
            const row = rows[0];
            return { id: Number(row.id), startYear: String(row.startYear), endYear: String(row.endYear) };
        } catch (err) {
            throw new InternalServerError("Failed to fetch active school year", 500, err);
        }
    }

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

    async getTeacherCount(): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS count FROM teachers";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch teacher count", 500, err);
        }
    }

    async getClassroomCount(): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS count FROM classrooms WHERE status IS NULL OR status <> 'inactive'";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch classroom count", 500, err);
        }
    }

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
                rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
            };
        } catch (err) {
            throw new InternalServerError("Failed to fetch today's attendance", 500, err);
        }
    }

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

    async getGradedEnrollments(schoolYearId?: number): Promise<number> {
        try {
            const query = `
                SELECT COUNT(DISTINCT ss.enrollmentId) AS count
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                JOIN enrollments e ON e.id = ss.enrollmentId AND e.status IN ('enrolled', 'completed')
                ${schoolYearId !== undefined ? "WHERE e.schoolYearId = ?" : ""}
            `;
            const params = schoolYearId !== undefined ? [schoolYearId] : [];
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, params);
            return Number(rows[0]?.count ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to fetch graded enrollments", 500, err);
        }
    }

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

    async getGradeSubmissionProgress(
        schoolYearId: number,
        quarter: number
    ): Promise<{ submitted: number; total: number }> {
        try {
            const totalQuery = `
                SELECT COUNT(DISTINCT e.id) AS total
                FROM enrollments e
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                WHERE e.status IN ('enrolled', 'completed') AND e.schoolYearId = ?
            `;
            const [totalRows] = await this.connection.execute<RowDataPacket[]>(totalQuery, [schoolYearId]);
            const total = Number(totalRows[0]?.total ?? 0);

            const submittedQuery = `
                SELECT COUNT(DISTINCT e.id) AS submitted
                FROM enrollments e
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                JOIN student_academic_records sar ON sar.enrollmentId = e.id
                JOIN student_academic_record_quarters sarq ON sarq.recordId = sar.id AND sarq.quarter = ? AND sarq.status = 'submitted'
                WHERE e.status IN ('enrolled', 'completed') AND e.schoolYearId = ?
            `;
            const [submittedRows] = await this.connection.execute<RowDataPacket[]>(submittedQuery, [quarter, schoolYearId]);
            const submitted = Number(submittedRows[0]?.submitted ?? 0);

            return { submitted, total };
        } catch (err) {
            throw new InternalServerError("Failed to fetch grade submission progress", 500, err);
        }
    }

    async buildAttentionItems(
        schoolYearId: number,
        quarter: number
    ): Promise<DashboardAttentionItem[]> {
        const items: DashboardAttentionItem[] = [];

        const [classesWithoutAdviser, incompleteClasses] = await Promise.all([
            this.getClassesWithoutAdviser(schoolYearId),
            this.getIncompleteClasses(quarter, schoolYearId),
        ]);

        if (classesWithoutAdviser.length > 0) {
            items.push({
                id: "no-adviser",
                type: "warning",
                message: `${classesWithoutAdviser.length} class${classesWithoutAdviser.length > 1 ? "es" : ""} don't have an assigned adviser`,
                detail: classesWithoutAdviser.map((c) => c.section).join(", "),
                actionLabel: "Manage Classes",
                actionPath: "/admin/classrooms",
                count: classesWithoutAdviser.length,
            });
        }

        if (incompleteClasses.length > 0) {
            const totalMissing = incompleteClasses.reduce(
                (sum, c) => sum + (c.total - c.submitted), 0
            );
            items.push({
                id: "incomplete-submissions",
                type: "warning",
                message: `${incompleteClasses.length} class${incompleteClasses.length > 1 ? "es" : ""} have incomplete Quarter ${quarter} submissions`,
                detail: `${totalMissing} student record${totalMissing !== 1 ? "s" : ""} pending across ${incompleteClasses.length} class${incompleteClasses.length !== 1 ? "es" : ""}`,
                actionLabel: "View Submissions",
                actionPath: "/admin/student-records",
                count: incompleteClasses.length,
            });
        }

        return items;
    }
}
