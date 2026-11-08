import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import jwt from "jsonwebtoken";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import app from "../src/app.js";
import getEnv from "../src/helper/getEnv.js";
import { getTestConnection } from "./helpers/db.js";
import { createScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";
import { ROLES } from "../src/constant/users.js";

/**
 * Full-Surface HTTP Mutation Tests.
 *
 * Exercises all primary POST, PUT, and PATCH routes against the running Express application
 * and the database to verify that every mutating endpoint operates correctly with the
 * restructured database architecture.
 */

// Minimal valid 1x1 PNG
const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
);

function tokenFor(role: string = "admin", id = 1): string {
    return jwt.sign({ id, email: `${role}@test.local`, role }, getEnv("JWT_SECRET"));
}

describe("Full-Surface Mutating HTTP Routes (POST, PUT, PATCH)", () => {
    let server: Server;
    let baseUrl: string;
    let connection: PoolConnection;
    let scenario: Scenario;
    let adminUserId: number;
    let developerUserId: number;

    // IDs of resources dynamically created during tests
    let createdClassroomId: number;
    let createdSubjectId: number;
    let createdClassSubjectId: number;
    let createdStudentId: number;
    let createdStudentUserId: number;
    let createdFacultyId: number;
    let createdUserId: number;
    let createdAssessmentId: number;
    let createdRequestId: number;
    let createdSchoolYearId: number;

    async function api(
        method: "POST" | "PUT" | "PATCH",
        path: string,
        body?: unknown,
        role: string = ROLES.ADMIN,
        userId?: number,
    ) {
        const effectiveUserId = userId ?? (role === ROLES.ADMIN ? adminUserId : (role === ROLES.DEVELOPER ? developerUserId : 1));
        const headers: Record<string, string> = {
            Cookie: `login_token=${tokenFor(role, effectiveUserId)}`,
        };

        let requestBody: any;
        if (body instanceof FormData) {
            requestBody = body;
        } else if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            requestBody = JSON.stringify(body);
        }

        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: requestBody,
        });

        const text = await response.text();
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = text;
        }
        return { status: response.status, body: json };
    }

    beforeAll(async () => {
        connection = await getTestConnection();
        scenario = await createScenario(connection);

        // Ensure only scenario school year is active so grade submissions and lookups succeed
        await connection.execute("UPDATE schoolyear SET isActive = 0");
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        // Assign adviser to scenario classroom directly (TASK-2)
        await connection.execute("UPDATE classrooms SET adviserFacultyId = ? WHERE id = ?", [
            scenario.facultyId,
            scenario.classroomId,
        ]);

        // Create an admin user so foreign keys (e.g. reviewerUserId on amendment_requests) succeed
        const [adminResult] = await connection.execute<any>(
            "INSERT INTO users (email, password, role, status) VALUES (?, 'hash', 'admin', 'active')",
            [`admin.${Date.now()}@test.local`],
        );
        adminUserId = adminResult.insertId;

        // Create a developer user for developer-only route tests
        const [devResult] = await connection.execute<any>(
            "INSERT INTO users (email, password, role, status) VALUES (?, 'hash', 'developer', 'active')",
            [`dev.${Date.now()}@test.local`],
        );
        developerUserId = devResult.insertId;

        // Ensure landing_content hero row exists so PATCH can update it
        await connection.execute(
            "INSERT INTO landing_content (section, content) VALUES ('hero', '{}') ON DUPLICATE KEY UPDATE content = content"
        );

        // Start HTTP test server
        server = await new Promise<Server>((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/api`;
    });

    afterAll(async () => {
        // 1. Clean up amendment records referencing scenario
        if (scenario) {
            await connection.execute("DELETE FROM amendment_audit_logs WHERE actorUserId IN (?, ?, ?)", [
                adminUserId ?? 0,
                developerUserId ?? 0,
                scenario.facultyUserId ?? 0,
            ]);
            await connection.execute(
                "DELETE FROM amendment_permissions WHERE requestId IN (SELECT id FROM amendment_requests WHERE enrollmentId = ?)",
                [scenario.enrollmentId],
            );
            await connection.execute("DELETE FROM amendment_requests WHERE enrollmentId = ?", [
                scenario.enrollmentId,
            ]);

            // 2. Clean up student academic records created during test
            await connection.execute(
                "DELETE FROM student_academic_record_components WHERE subjectRowId IN (SELECT id FROM student_academic_record_subjects WHERE recordId IN (SELECT id FROM student_academic_records WHERE enrollmentId = ?))",
                [scenario.enrollmentId],
            );
            await connection.execute(
                "DELETE FROM student_academic_record_subjects WHERE recordId IN (SELECT id FROM student_academic_records WHERE enrollmentId = ?)",
                [scenario.enrollmentId],
            );
            await connection.execute(
                "DELETE FROM student_academic_record_quarters WHERE recordId IN (SELECT id FROM student_academic_records WHERE enrollmentId = ?)",
                [scenario.enrollmentId],
            );
            await connection.execute("DELETE FROM student_academic_records WHERE enrollmentId = ?", [
                scenario.enrollmentId,
            ]);
        }

        // 3. Clean up additional test resources
        if (createdStudentId) {
            await connection.execute(
                "DELETE FROM enrollment_details WHERE enrollmentId IN (SELECT id FROM enrollments WHERE studentId = ?)",
                [createdStudentId],
            );
            await connection.execute("DELETE FROM enrollments WHERE studentId = ?", [createdStudentId]);
            await connection.execute("DELETE FROM students WHERE id = ?", [createdStudentId]);
        }
        if (createdStudentUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [createdStudentUserId]);
        }
        if (createdAssessmentId) {
            await connection.execute("DELETE FROM student_scores WHERE assessmentId = ?", [createdAssessmentId]);
            await connection.execute("DELETE FROM assessments WHERE id = ?", [createdAssessmentId]);
        }
        if (createdClassSubjectId) {
            await connection.execute("DELETE FROM grading_weights WHERE classSubjectId = ?", [createdClassSubjectId]);
            await connection.execute("DELETE FROM class_subjects WHERE id = ?", [createdClassSubjectId]);
        }
        if (createdSubjectId) {
            await connection.execute("DELETE FROM faculty_subject_assignment WHERE subjectId = ?", [createdSubjectId]);
            await connection.execute("DELETE FROM subjects WHERE id = ?", [createdSubjectId]);
        }
        if (createdClassroomId) {
            await connection.execute("DELETE FROM classrooms WHERE id = ?", [createdClassroomId]);
        }
        if (createdFacultyId) {
            await connection.execute("DELETE FROM faculties WHERE id = ?", [createdFacultyId]);
        }
        if (createdUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [createdUserId]);
        }
        if (createdSchoolYearId) {
            await connection.execute("DELETE FROM schoolyear WHERE id = ?", [createdSchoolYearId]);
        }
        if (developerUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [developerUserId]);
        }
        if (adminUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
        }

        await teardownScenario(connection, scenario);
        connection.release();
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });

    // =========================================================================
    // 1. School Info, Logo & Signature
    // =========================================================================
    describe("School Information & Media Assets", () => {
        it("PATCH /school-info updates school metadata", async () => {
            const res = await api("PATCH", "/school-info", {
                name: "Updated National High School",
                district: "Central District",
                division: "City Division",
                region: "Region XII",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /school-info/logo persists logo directly in school_logo (TASK-6)", async () => {
            const form = new FormData();
            form.append("image", new Blob([PNG_1x1], { type: "image/png" }), "logo.png");

            const res = await api("POST", "/school-info/logo", form);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.logo.mimeType).toBe("image/png");

            // Verify stored in school_logo single table
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT byteSize, LENGTH(image) as imgLen FROM school_logo LIMIT 1",
            );
            expect(Number(rows[0]?.imgLen)).toBeGreaterThan(0);
        });

        it("POST /school-info/signature persists signature directly in school_signature", async () => {
            const form = new FormData();
            form.append("image", new Blob([PNG_1x1], { type: "image/png" }), "signature.png");

            const res = await api("POST", "/school-info/signature", form);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 2. Grading Weights Defaults & Academic Settings
    // =========================================================================
    describe("Grading Weights & Academic Settings", () => {
        it("PATCH /grading-weight-defaults updates default weights in grading_weights (TASK-4)", async () => {
            const res = await api("PATCH", "/grading-weight-defaults", {
                writtenWorkWeight: 30,
                performanceTaskWeight: 50,
                quarterlyAssessmentWeight: 20,
                attendanceWeight: 0,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify row exists where classSubjectId IS NULL
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT writtenWorkWeight, performanceTaskWeight FROM grading_weights WHERE classSubjectId IS NULL",
            );
            expect(rows[0]?.writtenWorkWeight).toBe("30.00");
            expect(rows[0]?.performanceTaskWeight).toBe("50.00");
        });

        it("PATCH /academic-settings updates global settings", async () => {
            const res = await api("PATCH", "/academic-settings", {
                enrollmentOpen: 1,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 3. Classrooms & Adviser Assignment
    // =========================================================================
    describe("Classrooms & Adviser Consolidation", () => {
        const sectionName = `S_${Date.now().toString(36)}`;

        it("POST /classrooms creates a new section", async () => {
            const res = await api("POST", "/classrooms", {
                gradeLevel: 10,
                section: sectionName,
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM classrooms WHERE section = ?",
                [sectionName],
            );
            createdClassroomId = rows[0]?.id;
            expect(createdClassroomId).toBeDefined();
        });

        it("PUT /classrooms/:id updates classroom details", async () => {
            const res = await api("PUT", `/classrooms/${createdClassroomId}`, {
                gradeLevel: 10,
                section: `Renamed_${Date.now()}`,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PUT /classrooms/:id/adviser sets adviser directly on classrooms (TASK-2)", async () => {
            const res = await api("PUT", `/classrooms/${scenario.classroomId}/adviser`, {
                facultyId: scenario.facultyId,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify classrooms.adviserFacultyId directly
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT adviserFacultyId FROM classrooms WHERE id = ?",
                [scenario.classroomId],
            );
            expect(rows[0]?.adviserFacultyId).toBe(scenario.facultyId);
        });
    });

    // =========================================================================
    // 4. Subjects, Components & Class Subjects
    // =========================================================================
    describe("Subjects & Class Subject Assignments", () => {
        const subjectCode = `TS_${Date.now().toString(36).toUpperCase()}`;

        it("POST /subjects creates a new subject", async () => {
            const res = await api("POST", "/subjects", {
                name: `TestSub_${Date.now()}`,
                code: subjectCode,
                description: "Test Subject Description",
                unit: 1,
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM subjects WHERE code = ?",
                [subjectCode],
            );
            createdSubjectId = rows[0]?.id;
            expect(createdSubjectId).toBeDefined();
        });

        it("PUT /subjects/:id updates subject information", async () => {
            const res = await api("PUT", `/subjects/${createdSubjectId}`, {
                name: `UpdatedSub_${Date.now()}`,
                code: `US_${Date.now().toString(36).toUpperCase()}`,
                unit: 2,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /subjects/:id/assign-faculties assigns teacher to subject pool", async () => {
            const res = await api("POST", `/subjects/${createdSubjectId}/assign-faculties`, {
                facultiesId: [scenario.facultyId],
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /classrooms/subjects assigns subject and teacher to classroom", async () => {
            const res = await api("POST", "/classrooms/subjects", {
                newSubjects: [
                    {
                        classId: scenario.classroomId,
                        subjectId: createdSubjectId,
                        facultyId: scenario.facultyId,
                    },
                ],
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM class_subjects WHERE classId = ? AND subjectId = ?",
                [scenario.classroomId, createdSubjectId],
            );
            createdClassSubjectId = rows[0]?.id;
            expect(createdClassSubjectId).toBeDefined();
        });

        it("PUT /class-subjects/:classSubjectId/weights updates custom weights", async () => {
            const res = await api("PUT", `/class-subjects/${createdClassSubjectId}/weights`, {
                writtenWorkWeight: 40,
                performanceTaskWeight: 40,
                quarterlyAssessmentWeight: 20,
                attendanceWeight: 0,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 5. Students & Student Profile Details (TASK-3)
    // =========================================================================
    describe("Students & Details Consolidation", () => {
        const uniqueLrn = Math.floor(100000000000 + Math.random() * 900000000000);

        it("POST /students registers a new student", async () => {
            const res = await api("POST", "/students", {
                lrn: uniqueLrn,
                email: `student.${Date.now()}@test.local`,
                firstname: "Juan",
                middlename: "Santos",
                lastname: "Cruz",
                birthdate: "2010-05-15",
                sex: "Male",
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id, userId FROM students WHERE lrn = ?",
                [uniqueLrn],
            );
            createdStudentId = rows[0]?.id;
            createdStudentUserId = rows[0]?.userId;
            expect(createdStudentId).toBeDefined();
        });

        it("PATCH /students/:id updates student basic data", async () => {
            const res = await api("PATCH", `/students/${createdStudentId}`, {
                firstname: "Johnny",
                lastname: "Cruzer",
                sex: "Male",
                birthdate: "2010-05-15",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /students/details updates profile fields directly in students table (TASK-3)", async () => {
            const res = await api(
                "PATCH",
                "/students/details",
                {
                    guardianName: "Maria Cruz",
                    guardianContact: "09123456789",
                    permanentAddress: "123 Main St, Poblacion",
                    religion: "Christian",
                },
                ROLES.STUDENT,
                createdStudentUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify directly on students table
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT guardianName, permanentAddress, religion FROM students WHERE id = ?",
                [createdStudentId],
            );
            expect(rows[0]?.guardianName).toBe("Maria Cruz");
            expect(rows[0]?.permanentAddress).toBe("123 Main St, Poblacion");
            expect(rows[0]?.religion).toBe("Christian");
        });

        it("POST /enrollments enrolls student directly through enrollments.classId (TASK-1)", async () => {
            const res = await api("POST", "/enrollments", {
                studentId: createdStudentId,
                classId: createdClassroomId,
                schoolYearId: scenario.schoolYearId,
                gradeLevel: 10,
                subjectIds: [scenario.subjectId],
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            // Verify enrollments.classId directly
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT classId, status FROM enrollments WHERE studentId = ? AND schoolYearId = ?",
                [createdStudentId, scenario.schoolYearId],
            );
            expect(rows[0]?.classId).toBe(createdClassroomId);
            expect(rows[0]?.status).toBe("enrolled");
        });
    });

    // =========================================================================
    // 6. Faculties & User Accounts
    // =========================================================================
    describe("Faculties & User Management", () => {
        const facultyEmail = `faculty.${Date.now()}@test.local`;
        const userEmail = `user.${Date.now()}@test.local`;

        it("POST /faculties creates a new faculty member", async () => {
            const res = await api("POST", "/faculties", {
                email: facultyEmail,
                firstname: "Robert",
                middlename: "L",
                lastname: "Perez",
                gender: "Male",
                role: "teacher",
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM faculties WHERE email = ?",
                [facultyEmail],
            );
            createdFacultyId = rows[0]?.id;
            expect(createdFacultyId).toBeDefined();
        });

        it("PATCH /faculties/:id updates faculty profile", async () => {
            const res = await api("PATCH", `/faculties/${createdFacultyId}`, {
                firstname: "Roberto",
                lastname: "Perez-Gomez",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /users creates a standalone user account", async () => {
            const res = await api("POST", "/users", {
                email: userEmail,
                password: "Password123!",
                role: "teacher",
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM users WHERE email = ?",
                [userEmail],
            );
            createdUserId = rows[0]?.id;
            expect(createdUserId).toBeDefined();
        });

        it("PUT /users/:id updates user credentials", async () => {
            const res = await api(
                "PUT",
                `/users/${createdUserId}`,
                {
                    email: `updated.${Date.now()}@test.local`,
                },
                ROLES.ADMIN,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /users/:id/status updates account status (Developer only)", async () => {
            const res = await api(
                "PATCH",
                `/users/${createdUserId}/status`,
                { status: "inactive" },
                ROLES.DEVELOPER,
                developerUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /users/:id/role updates account role (Developer only)", async () => {
            const res = await api(
                "PATCH",
                `/users/${createdUserId}/role`,
                { role: "admin" },
                ROLES.DEVELOPER,
                developerUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /users/:id/reset-password resets user password (Developer only)", async () => {
            const res = await api(
                "POST",
                `/users/${createdUserId}/reset-password`,
                {},
                ROLES.DEVELOPER,
                developerUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.tempPassword).toBeDefined();
        });
    });

    // =========================================================================
    // 7. Assessments & Student Scores
    // =========================================================================
    describe("Assessments & Scoring Workflow", () => {
        it("POST /assessments creates an assessment", async () => {
            const res = await api("POST", "/assessments", {
                classSubjectId: scenario.classSubjectId,
                title: `Quiz_${Date.now()}`,
                type: "written_work",
                maxScore: 50,
                quarter: 1,
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            createdAssessmentId = res.body.data.assessmentId;
            expect(createdAssessmentId).toBeDefined();
        });

        it("PATCH /assessments/:id updates assessment details", async () => {
            const res = await api("PATCH", `/assessments/${createdAssessmentId}`, {
                title: "Updated Quiz Title",
                maxScore: 60,
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /assessments/:id/scores records scores for enrolled students", async () => {
            const res = await api("POST", `/assessments/${createdAssessmentId}/scores`, {
                scores: [
                    {
                        enrollmentId: scenario.enrollmentId,
                        score: 45,
                    },
                ],
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /assessments/:id/scores/:enrollmentId updates single student score", async () => {
            const res = await api(
                "PATCH",
                `/assessments/${createdAssessmentId}/scores/${scenario.enrollmentId}`,
                { score: 55 },
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 8. Attendance Tracking
    // =========================================================================
    describe("Attendance Recording", () => {
        it("POST /attendance records attendance entries for a class date", async () => {
            const res = await api("POST", "/attendance", {
                classSubjectId: scenario.classSubjectId,
                date: "2026-11-01",
                quarter: 1,
                entries: [
                    {
                        enrollmentId: scenario.enrollmentId,
                        status: "present",
                        remarks: "On time",
                    },
                ],
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /attendance/class-subjects/:classSubjectId/students/:enrollmentId updates attendance status", async () => {
            const res = await api(
                "PATCH",
                `/attendance/class-subjects/${scenario.classSubjectId}/students/${scenario.enrollmentId}`,
                {
                    date: "2026-11-01",
                    status: "absent",
                    quarter: 1,
                },
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 9. Student Records & Finalization
    // =========================================================================
    describe("Student Academic Records Finalization", () => {
        it("POST /student-records/class/:classId/students/:enrollmentId/quarter/:quarter/submit freezes student record", async () => {
            const res = await api(
                "POST",
                `/student-records/class/${scenario.classroomId}/students/${scenario.enrollmentId}/quarter/1/submit`,
                {},
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify student_academic_records row exists
            const [rows] = await connection.execute<RowDataPacket[]>(
                "SELECT id, classSection, classGradeLevel FROM student_academic_records WHERE enrollmentId = ?",
                [scenario.enrollmentId],
            );
            expect(rows.length).toBe(1);
        });

        it("POST /student-records/class/:classId/students/:enrollmentId/quarter/:quarter/reopen reopens student record", async () => {
            const res = await api(
                "POST",
                `/student-records/class/${scenario.classroomId}/students/${scenario.enrollmentId}/quarter/1/reopen`,
                {},
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /student-records/class-subjects/:classSubjectId/quarter/:quarter/submit submits subject records", async () => {
            const res = await api(
                "POST",
                `/student-records/class-subjects/${scenario.classSubjectId}/quarter/1/submit`,
                {},
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /student-records/class-subjects/:classSubjectId/quarter/:quarter/reopen reopens subject submission", async () => {
            const res = await api(
                "POST",
                `/student-records/class-subjects/${scenario.classSubjectId}/quarter/1/reopen`,
                {},
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 10. Amendments Workflow
    // =========================================================================
    describe("Amendments Workflow", () => {
        it("POST /amendments/requests submits an amendment request", async () => {
            const res = await api(
                "POST",
                "/amendments/requests",
                {
                    enrollmentId: scenario.enrollmentId,
                    classId: scenario.classroomId,
                    classSubjectId: scenario.classSubjectId,
                    quarter: 1,
                    recordType: "gradebook_score",
                    reason: "Correction of encoding error in quarterly exam",
                    details: {
                        assessmentId: scenario.assessmentId,
                        currentScore: 45,
                        proposedScore: 50,
                    },
                },
                ROLES.TEACHER,
                scenario.facultyUserId,
            );
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            createdRequestId = res.body.data.id;
            expect(createdRequestId).toBeDefined();
        });

        it("POST /amendments/requests/:id/approve approves amendment request", async () => {
            const res = await api("POST", `/amendments/requests/${createdRequestId}/approve`, {
                reviewRemarks: "Approved upon verification",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /amendments/requests/:id/revoke revokes an active permission", async () => {
            const res = await api("POST", `/amendments/requests/${createdRequestId}/revoke`, {
                reason: "Administrative revocation",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /amendments/requests/:id/reject rejects an amendment request", async () => {
            // Submit another request to reject
            const createRes = await api(
                "POST",
                "/amendments/requests",
                {
                    enrollmentId: scenario.enrollmentId,
                    classId: scenario.classroomId,
                    classSubjectId: scenario.classSubjectId,
                    quarter: 1,
                    recordType: "attendance",
                    reason: "Correction of absent mark to excused",
                    details: {
                        date: "2026-11-01",
                        proposedStatus: "excused",
                    },
                },
                ROLES.TEACHER,
                scenario.facultyUserId,
            );
            const reqId = createRes.body.data.id;

            const res = await api("POST", `/amendments/requests/${reqId}/reject`, {
                reason: "Insufficient justification provided",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 11. Feature Flags & Landing Page Content
    // =========================================================================
    describe("Features & Landing Content Management", () => {
        it("PATCH /features/:key updates a feature flag (Developer only)", async () => {
            const res = await api(
                "PATCH",
                "/features/reports_analytics",
                { enabled: true },
                ROLES.DEVELOPER,
                developerUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /landing-content/:section updates landing page content (Developer only)", async () => {
            const res = await api(
                "PATCH",
                "/landing-content/hero",
                {
                    slides: [{ image: "/assets/hero-1.svg", label: "Campus" }],
                    title: "GradeSync School Portal",
                    titleAccent: " Simplified",
                    subtitle: "Empowering educators and learners across the institution",
                },
                ROLES.DEVELOPER,
                developerUserId,
            );
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // =========================================================================
    // 12. School Year & Authentication Routes
    // =========================================================================
    describe("School Year & Authentication", () => {
        it("POST /schoolYear creates a new school year record", async () => {
            // Delete existing current year if present so createSchoolYear succeeds
            await connection.execute("DELETE FROM schoolyear WHERE startYear = ?", [
                String(new Date().getFullYear()),
            ]);

            const res = await api("POST", "/schoolYear", {});
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            createdSchoolYearId = res.body.data.id;
            expect(createdSchoolYearId).toBeDefined();
        });

        it("PATCH /schoolYear/:id/activate activates the school year", async () => {
            const res = await api("PATCH", `/schoolYear/${createdSchoolYearId}/activate`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("PATCH /schoolYear/:id/status updates school year status", async () => {
            const res = await api("PATCH", `/schoolYear/${createdSchoolYearId}/status`, {
                status: "completed",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /users/logout terminates the user session and clears token cookie", async () => {
            const res = await api("POST", "/users/logout");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /users/login rejects invalid credentials", async () => {
            const res = await api("POST", "/users/login", {
                email: "nonexistent@test.local",
                password: "WrongPassword123!",
            });
            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });
});
