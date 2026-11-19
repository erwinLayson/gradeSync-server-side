import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

import AnalyticsRoutes from "../src/routes/analytics.js";
import ErrorHandler from "../src/middleware/errorHandler.js";
import getEnv from "../src/helper/getEnv.js";
import { getTestConnection, insert } from "./helpers/db.js";
import { getStudentQuarterlyRankingsService } from "../src/service/analytics.js";
import { BadRequestError } from "../src/middleware/errors.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api", AnalyticsRoutes);
app.use(ErrorHandler);

function tokenFor(role: "admin" | "teacher", id = 1): string {
    return jwt.sign({ id, email: `${role}@test.local`, role }, getEnv("JWT_SECRET"));
}

describe("Student Quarterly Rankings Backend Tests", () => {
    let connection: PoolConnection;
    let server: Server;
    let baseUrl: string;

    const cleanupIds = {
        users: [] as number[],
        students: [] as number[],
        classrooms: [] as number[],
        schoolYears: [] as number[],
        enrollments: [] as number[],
        records: [] as number[],
    };

    beforeAll(async () => {
        connection = await getTestConnection();
        server = await new Promise<Server>((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}/api/analytics/student-rankings`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        connection.release();
    });

    afterEach(async () => {
        if (cleanupIds.records.length > 0) {
            const ph = cleanupIds.records.map(() => "?").join(",");
            await connection.execute(`DELETE FROM student_academic_record_subjects WHERE recordId IN (${ph})`, cleanupIds.records);
            await connection.execute(`DELETE FROM student_academic_record_quarters WHERE recordId IN (${ph})`, cleanupIds.records);
            await connection.execute(`DELETE FROM student_academic_records WHERE id IN (${ph})`, cleanupIds.records);
            cleanupIds.records = [];
        }
        if (cleanupIds.enrollments.length > 0) {
            const ph = cleanupIds.enrollments.map(() => "?").join(",");
            await connection.execute(`DELETE FROM enrollments WHERE id IN (${ph})`, cleanupIds.enrollments);
            cleanupIds.enrollments = [];
        }
        if (cleanupIds.classrooms.length > 0) {
            const ph = cleanupIds.classrooms.map(() => "?").join(",");
            await connection.execute(`DELETE FROM classrooms WHERE id IN (${ph})`, cleanupIds.classrooms);
            cleanupIds.classrooms = [];
        }
        if (cleanupIds.students.length > 0) {
            const ph = cleanupIds.students.map(() => "?").join(",");
            await connection.execute(`DELETE FROM students WHERE id IN (${ph})`, cleanupIds.students);
            cleanupIds.students = [];
        }
        if (cleanupIds.users.length > 0) {
            const ph = cleanupIds.users.map(() => "?").join(",");
            await connection.execute(`DELETE FROM users WHERE id IN (${ph})`, cleanupIds.users);
            cleanupIds.users = [];
        }
        if (cleanupIds.schoolYears.length > 0) {
            const ph = cleanupIds.schoolYears.map(() => "?").join(",");
            await connection.execute(`DELETE FROM schoolyear WHERE id IN (${ph})`, cleanupIds.schoolYears);
            cleanupIds.schoolYears = [];
        }
    });

    // Helper to create school year
    async function createSchoolYear(startYear: string, endYear: string): Promise<number> {
        const id = await insert(
            connection,
            "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?, 0)",
            [startYear, endYear]
        );
        cleanupIds.schoolYears.push(id);
        return id;
    }

    // Helper to create a student with enrollment and academic record
    async function createStudentWithRecord(options: {
        schoolYearId: number;
        gradeLevel: number;
        section: string;
        firstname: string;
        lastname: string;
        lrn: string;
    }): Promise<{ studentId: number; enrollmentId: number; recordId: number }> {
        const userId = await insert(
            connection,
            "INSERT INTO users(email, password, role, status) VALUES(?,?, 'student', 'active')",
            [`st_${Date.now()}_${Math.random().toString(36).slice(2)}@test.local`, "hash"]
        );
        cleanupIds.users.push(userId);

        const studentId = await insert(
            connection,
            "INSERT INTO students(userId, email, lrn, firstname, lastname, sex, status) VALUES(?,?,?,?,?, 'Male', 'active')",
            [userId, `st_${userId}@test.local`, options.lrn, options.firstname, options.lastname]
        );
        cleanupIds.students.push(studentId);

        const [existingClassrooms] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM classrooms WHERE gradeLevel = ? AND section = ? LIMIT 1",
            [options.gradeLevel, options.section]
        );
        let classroomId: number;
        if (existingClassrooms.length > 0) {
            classroomId = (existingClassrooms[0] as { id: number }).id;
        } else {
            classroomId = await insert(
                connection,
                "INSERT INTO classrooms(gradeLevel, section, status) VALUES(?,?,'active')",
                [options.gradeLevel, options.section]
            );
            cleanupIds.classrooms.push(classroomId);
        }

        const enrollmentId = await insert(
            connection,
            "INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId, status) VALUES(NOW(),?,?,?,'enrolled')",
            [classroomId, options.schoolYearId, studentId]
        );
        cleanupIds.enrollments.push(enrollmentId);

        const recordId = await insert(
            connection,
            "INSERT INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName) VALUES(?,?,?,'Test Adviser')",
            [enrollmentId, options.section, options.gradeLevel]
        );
        cleanupIds.records.push(recordId);

        return { studentId, enrollmentId, recordId };
    }

    // Helper to add finalized subjects and quarter submission
    async function finalizeQuarterGrades(
        recordId: number,
        quarter: number,
        subjectGrades: { name: string; code: string; grade: number | null }[],
        quarterStatus: "submitted" | "pending" = "submitted"
    ) {
        for (const subj of subjectGrades) {
            const qCol = `q${quarter}`;
            await insert(
                connection,
                `INSERT INTO student_academic_record_subjects(recordId, subjectName, subjectCode, ${qCol})
                 VALUES(?,?,?,?)
                 ON DUPLICATE KEY UPDATE ${qCol} = VALUES(${qCol})`,
                [recordId, subj.name, subj.code, subj.grade]
            );
        }

        await insert(
            connection,
            `INSERT INTO student_academic_record_quarters(recordId, quarter, status, submittedAt)
             VALUES(?,?,?, NOW())
             ON DUPLICATE KEY UPDATE status = VALUES(status), submittedAt = NOW()`,
            [recordId, quarter, quarterStatus]
        );
    }

    // ==================== 1. AUTHORIZATION TESTS ====================
    describe("Authorization & Validation", () => {
        it("returns 401 when request has no token", async () => {
            const res = await fetch(`${baseUrl}?schoolYearId=1&quarter=1`);
            expect(res.status).toBe(401);
        });

        it("returns 403 when request is made by a non-admin role", async () => {
            const res = await fetch(`${baseUrl}?schoolYearId=1&quarter=1`, {
                headers: { Cookie: `login_token=${tokenFor("teacher")}` },
            });
            expect(res.status).toBe(403);
        });

        it("validates missing schoolYearId", async () => {
            const res = await fetch(`${baseUrl}?quarter=1`, {
                headers: { Cookie: `login_token=${tokenFor("admin")}` },
            });
            expect(res.status).toBe(400);
            const body = await res.json() as { message: string };
            expect(body.message).toContain("schoolYearId query parameter is required");
        });

        it("validates invalid quarter (must be 1-4)", async () => {
            const res = await fetch(`${baseUrl}?schoolYearId=1&quarter=5`, {
                headers: { Cookie: `login_token=${tokenFor("admin")}` },
            });
            expect(res.status).toBe(400);
            const body = await res.json() as { message: string };
            expect(body.message).toContain("quarter query parameter must be an integer between 1 and 4");
        });

        it("validates invalid gradeLevel", async () => {
            const res = await fetch(`${baseUrl}?schoolYearId=1&quarter=1&gradeLevel=-2`, {
                headers: { Cookie: `login_token=${tokenFor("admin")}` },
            });
            expect(res.status).toBe(400);
            const body = await res.json() as { message: string };
            expect(body.message).toContain("gradeLevel query parameter must be a positive integer");
        });
    });

    // ==================== 2. INDEPENDENT GRADE LEVEL RANKING TESTS ====================
    describe("Independent Grade Level Rankings", () => {
        it("calculates rankings independently for each grade level, starting each at Rank 1", async () => {
            const syId = await createSchoolYear("2026", "2027");

            // Create Grade 7 student
            const g7 = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Section A - G7",
                firstname: "Alice",
                lastname: "G7",
                lrn: "100000000001",
            });
            await finalizeQuarterGrades(g7.recordId, 1, [
                { name: "Math", code: "M7", grade: 90 },
                { name: "English", code: "E7", grade: 90 },
            ]); // Avg: 90.00

            // Create Grade 8 student with HIGHER average than Grade 7 student
            const g8 = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 8,
                section: "Section B - G8",
                firstname: "Bob",
                lastname: "G8",
                lrn: "100000000002",
            });
            await finalizeQuarterGrades(g8.recordId, 1, [
                { name: "Math", code: "M8", grade: 95 },
                { name: "English", code: "E8", grade: 95 },
            ]); // Avg: 95.00

            // Call service for All Grade Levels
            const response = await getStudentQuarterlyRankingsService(syId, 1);

            const g7Group = response.groups.find((g) => g.gradeLevel === 7);
            const g8Group = response.groups.find((g) => g.gradeLevel === 8);

            expect(g7Group).toBeDefined();
            expect(g8Group).toBeDefined();

            // Students must NEVER be combined across grade levels
            expect(g7Group!.rankings).toHaveLength(1);
            expect(g7Group!.rankings[0]!.studentName).toBe("Alice G7");
            expect(g7Group!.rankings[0]!.rank).toBe(1); // Grade 7 starts at Rank 1!
            expect(g7Group!.rankings[0]!.generalAverage).toBe(90.00);

            expect(g8Group!.rankings).toHaveLength(1);
            expect(g8Group!.rankings[0]!.studentName).toBe("Bob G8");
            expect(g8Group!.rankings[0]!.rank).toBe(1); // Grade 8 also starts at Rank 1!
            expect(g8Group!.rankings[0]!.generalAverage).toBe(95.00);
        });

        it("filters strictly by a specific grade level when requested", async () => {
            const syId = await createSchoolYear("2026", "2027");

            const g7 = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Section A - G7",
                firstname: "Charlie",
                lastname: "G7",
                lrn: "100000000003",
            });
            await finalizeQuarterGrades(g7.recordId, 1, [{ name: "Math", code: "M7", grade: 88 }]);

            const g8 = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 8,
                section: "Section B - G8",
                firstname: "Diana",
                lastname: "G8",
                lrn: "100000000004",
            });
            await finalizeQuarterGrades(g8.recordId, 1, [{ name: "Math", code: "M8", grade: 92 }]);

            // Query specifically for Grade 8
            const response = await getStudentQuarterlyRankingsService(syId, 1, 8);
            expect(response.gradeLevel).toBe(8);
            expect(response.groups).toHaveLength(1);
            expect(response.groups[0]!.gradeLevel).toBe(8);
            expect(response.groups[0]!.rankings).toHaveLength(1);
            expect(response.groups[0]!.rankings[0]!.studentName).toBe("Diana G8");
        });
    });

    // ==================== 3. COMPETITION RANKING & TIES TESTS ====================
    describe("Competition Ranking & Ties", () => {
        it("correctly applies standard competition ranking (1, 2, 2, 4, 5)", async () => {
            const syId = await createSchoolYear("2026", "2027");

            // Student A: 98.50
            const stA = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Student",
                lastname: "A",
                lrn: "LRN_A",
            });
            await finalizeQuarterGrades(stA.recordId, 1, [{ name: "Math", code: "M", grade: 98.50 }]);

            // Student B: 97.25
            const stB = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Student",
                lastname: "B",
                lrn: "LRN_B",
            });
            await finalizeQuarterGrades(stB.recordId, 1, [{ name: "Math", code: "M", grade: 97.25 }]);

            // Student C: 97.25 (TIED with Student B)
            const stC = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Student",
                lastname: "C",
                lrn: "LRN_C",
            });
            await finalizeQuarterGrades(stC.recordId, 1, [{ name: "Math", code: "M", grade: 97.25 }]);

            // Student D: 96.00
            const stD = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Student",
                lastname: "D",
                lrn: "LRN_D",
            });
            await finalizeQuarterGrades(stD.recordId, 1, [{ name: "Math", code: "M", grade: 96.00 }]);

            // Student E: 95.50
            const stE = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Student",
                lastname: "E",
                lrn: "LRN_E",
            });
            await finalizeQuarterGrades(stE.recordId, 1, [{ name: "Math", code: "M", grade: 95.50 }]);

            const response = await getStudentQuarterlyRankingsService(syId, 1, 7);
            const rankings = response.groups[0]!.rankings;

            expect(rankings).toHaveLength(5);
            expect(rankings[0]!.studentName).toBe("Student A");
            expect(rankings[0]!.generalAverage).toBe(98.50);
            expect(rankings[0]!.rank).toBe(1);

            expect(rankings[1]!.generalAverage).toBe(97.25);
            expect(rankings[1]!.rank).toBe(2);

            expect(rankings[2]!.generalAverage).toBe(97.25);
            expect(rankings[2]!.rank).toBe(2); // Tied with student B -> rank 2

            expect(rankings[3]!.studentName).toBe("Student D");
            expect(rankings[3]!.generalAverage).toBe(96.00);
            expect(rankings[3]!.rank).toBe(4); // Next rank skips to 4!

            expect(rankings[4]!.studentName).toBe("Student E");
            expect(rankings[4]!.generalAverage).toBe(95.50);
            expect(rankings[4]!.rank).toBe(5);
        });
    });

    // ==================== 4. STRICT FINALIZATION & INCOMPLETE DATA RULES ====================
    describe("Finalization & Eligibility Rules", () => {
        it("excludes students with pending (unfinalized) quarter status", async () => {
            const syId = await createSchoolYear("2026", "2027");

            const st = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Pending",
                lastname: "User",
                lrn: "LRN_PENDING",
            });
            // Quarter status is 'pending', not 'submitted'
            await finalizeQuarterGrades(st.recordId, 1, [{ name: "Math", code: "M", grade: 95 }], "pending");

            const response = await getStudentQuarterlyRankingsService(syId, 1, 7);
            expect(response.groups[0]!.rankings).toHaveLength(0);
            expect(response.groups[0]!.totalEligible).toBe(0);
        });

        it("excludes students with missing or null quarter grades for any enrolled subject", async () => {
            const syId = await createSchoolYear("2026", "2027");

            const st = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Incomplete",
                lastname: "Student",
                lrn: "LRN_INCOMPLETE",
            });
            // Has 2 subjects, but Science q1 grade is NULL
            await finalizeQuarterGrades(st.recordId, 1, [
                { name: "Math", code: "M", grade: 90 },
                { name: "Science", code: "S", grade: null },
            ], "submitted");

            const response = await getStudentQuarterlyRankingsService(syId, 1, 7);
            expect(response.groups[0]!.rankings).toHaveLength(0);
            expect(response.groups[0]!.totalEligible).toBe(0);
        });

        it("isolates rankings to the selected school year and quarter", async () => {
            const sy1 = await createSchoolYear("2025", "2026");
            const sy2 = await createSchoolYear("2026", "2027");

            const stSY1 = await createStudentWithRecord({
                schoolYearId: sy1,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "SY1",
                lastname: "Student",
                lrn: "LRN_SY1",
            });
            await finalizeQuarterGrades(stSY1.recordId, 1, [{ name: "Math", code: "M", grade: 91 }]);

            const stSY2 = await createStudentWithRecord({
                schoolYearId: sy2,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "SY2",
                lastname: "Student",
                lrn: "LRN_SY2",
            });
            await finalizeQuarterGrades(stSY2.recordId, 1, [{ name: "Math", code: "M", grade: 87 }]);

            // Query SY1 Q1 -> returns only stSY1
            const resSY1 = await getStudentQuarterlyRankingsService(sy1, 1, 7);
            expect(resSY1.groups[0]!.rankings).toHaveLength(1);
            expect(resSY1.groups[0]!.rankings[0]!.studentName).toBe("SY1 Student");

            // Query SY2 Q1 -> returns only stSY2
            const resSY2 = await getStudentQuarterlyRankingsService(sy2, 1, 7);
            expect(resSY2.groups[0]!.rankings).toHaveLength(1);
            expect(resSY2.groups[0]!.rankings[0]!.studentName).toBe("SY2 Student");

            // Query SY1 Q2 -> returns 0 (grades were for Q1, not Q2)
            const resSY1Q2 = await getStudentQuarterlyRankingsService(sy1, 2, 7);
            expect(resSY1Q2.groups[0]!.rankings).toHaveLength(0);
        });

        it("reflects updated officially approved and finalized amendment grade", async () => {
            const syId = await createSchoolYear("2026", "2027");

            const st = await createStudentWithRecord({
                schoolYearId: syId,
                gradeLevel: 7,
                section: "Sec A",
                firstname: "Amended",
                lastname: "Student",
                lrn: "LRN_AMENDED",
            });
            // Initial grade: 85
            await finalizeQuarterGrades(st.recordId, 1, [{ name: "Math", code: "M", grade: 85 }]);

            const initialRes = await getStudentQuarterlyRankingsService(syId, 1, 7);
            expect(initialRes.groups[0]!.rankings[0]!.generalAverage).toBe(85.00);

            // Approved amendment updates subject grade to 93
            await finalizeQuarterGrades(st.recordId, 1, [{ name: "Math", code: "M", grade: 93 }]);

            const updatedRes = await getStudentQuarterlyRankingsService(syId, 1, 7);
            expect(updatedRes.groups[0]!.rankings[0]!.generalAverage).toBe(93.00);
        });
    });
});
