import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import app from "../src/app.js";
import getEnv from "../src/helper/getEnv.js";
import { getTestConnection, insert, select } from "./helpers/db.js";
import { createScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";
import { ROLES } from "../src/constant/users.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../src/constant/activityAudit.js";

function tokenFor(role: string = "admin", id = 1): string {
    return jwt.sign({ id, email: `${role}@test.local`, role }, getEnv("JWT_SECRET"));
}

describe("Administrative Activity Audit and Monitoring Module", () => {
    let server: Server;
    let baseUrl: string;
    let connection: PoolConnection;
    let scenario: Scenario;
    let adminUserId: number;
    let registerUserId: number;
    let registerFacultyId: number;

    beforeAll(async () => {
        connection = await getTestConnection();
        scenario = await createScenario(connection);

        // Ensure active school year
        await connection.execute("UPDATE schoolyear SET isActive = 0");
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        // Create Admin user
        adminUserId = await insert(
            connection,
            "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)",
            [`admin.audit.${scenario.suffix}@test.local`, "test-hash", ROLES.ADMIN, "active"]
        );

        // Create Register user and faculty profile
        registerUserId = await insert(
            connection,
            "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)",
            [`register.audit.${scenario.suffix}@test.local`, "test-hash", ROLES.TEACHER, "active"]
        );
        registerFacultyId = await insert(
            connection,
            "INSERT INTO faculties(userId, email, firstname, lastname, role, gender) VALUES(?,?,?,?,?,?)",
            [registerUserId, `register.audit.${scenario.suffix}@test.local`, "Reg", "Staff", "register", "Female"]
        );

        // Set scenario faculty as classroom adviser
        await connection.execute(
            "UPDATE classrooms SET adviserFacultyId = ? WHERE id = ?",
            [scenario.facultyId, scenario.classroomId]
        );

        server = app.listen(0);
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api`;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        if (scenario) {
            await connection.execute(
                "DELETE FROM student_academic_records WHERE enrollmentId = ?",
                [scenario.enrollmentId]
            );
            await teardownScenario(connection, scenario);
        }
        if (registerFacultyId) {
            await connection.execute("DELETE FROM faculties WHERE id = ?", [registerFacultyId]);
        }
        if (registerUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [registerUserId]);
        }
        if (adminUserId) {
            await connection.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
        }
        connection.release();
    });

    async function reqApi(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: string,
        body?: unknown,
        token?: string
    ) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (token) {
            headers["Cookie"] = `login_token=${token}`;
        }
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        const contentType = res.headers.get("content-type") || "";
        let json: any = null;
        if (contentType.includes("application/json")) {
            json = await res.json();
        }
        return { status: res.status, headers: res.headers, body: json };
    }

    describe("Audit Logging Across Core System Activities", () => {
        it("records audit log when an individual report card is generated", async () => {
            const token = tokenFor(ROLES.TEACHER, scenario.facultyUserId);
            const res = await reqApi("GET", `/student/${scenario.enrollmentId}/report-card`, undefined, token);
            expect(res.status).toBe(200);

            const logs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.REPORT_CARD_GENERATED, String(scenario.enrollmentId)]
            );
            expect(logs.length).toBe(1);
            const log = logs[0];
            expect(Number(log.actorUserId)).toBe(scenario.facultyUserId);
            expect(log.actorRole).toBe("teacher");
            expect(log.entityType).toBe(AUDIT_ENTITY_TYPES.REPORT_CARD);
            expect(Number(log.gradeLevel)).toBe(scenario.gradeLevel);
            const metadata = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            expect(metadata.isBulk).toBe(false);
            expect(metadata.enrollmentId).toBe(scenario.enrollmentId);
        });

        it("records audit log when bulk report cards are generated for a classroom", async () => {
            const token = tokenFor(ROLES.TEACHER, scenario.facultyUserId);
            const res = await reqApi("GET", `/student/class/${scenario.classroomId}/report-cards/bulk`, undefined, token);
            expect(res.status).toBe(200);

            const logs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.REPORT_CARD_GENERATED, String(scenario.classroomId)]
            );
            expect(logs.length).toBe(1);
            const log = logs[0];
            expect(Number(log.actorUserId)).toBe(scenario.facultyUserId);
            expect(log.actorRole).toBe("teacher");
            expect(Number(log.classroomId)).toBe(scenario.classroomId);
            const metadata = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            expect(metadata.isBulk).toBe(true);
            expect(metadata.classId).toBe(scenario.classroomId);
            expect(metadata.totalStudents).toBeGreaterThanOrEqual(1);
        });

        it("records audit log when teacher creates, updates, and deletes an assessment", async () => {
            const token = tokenFor(ROLES.TEACHER, scenario.facultyUserId);

            // 1. Create assessment
            const createRes = await reqApi("POST", "/assessments", {
                classSubjectId: scenario.classSubjectId,
                quarter: 1,
                type: "written_work",
                title: `Audit Assessment ${scenario.suffix}`,
                maxScore: 50,
            }, token);
            expect(createRes.status).toBe(201);
            const assessmentId = createRes.body.data.assessmentId;

            const createLogs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.ACTIVITY_CREATED, String(assessmentId)]
            );
            expect(createLogs.length).toBe(1);
            expect(createLogs[0].entityType).toBe(AUDIT_ENTITY_TYPES.ASSESSMENT);
            expect(Number(createLogs[0].quarter)).toBe(1);
            expect(createLogs[0].description).toContain(`Audit Assessment ${scenario.suffix}`);

            // 2. Update assessment
            const updateRes = await reqApi("PATCH", `/assessments/${assessmentId}`, {
                title: `Audit Assessment Updated ${scenario.suffix}`,
                maxScore: 60,
            }, token);
            expect(updateRes.status).toBe(200);

            const updateLogs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.ACTIVITY_UPDATED, String(assessmentId)]
            );
            expect(updateLogs.length).toBe(1);
            const diff = typeof updateLogs[0].diff === "string" ? JSON.parse(updateLogs[0].diff) : updateLogs[0].diff;
            expect(diff).toBeDefined();
            expect(diff.title.to).toBe(`Audit Assessment Updated ${scenario.suffix}`);
            expect(Number(diff.maxScore.to)).toBe(60);

            // 3. Delete assessment
            const deleteRes = await reqApi("DELETE", `/assessments/${assessmentId}`, undefined, token);
            expect(deleteRes.status).toBe(200);

            const deleteLogs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.ACTIVITY_DELETED, String(assessmentId)]
            );
            expect(deleteLogs.length).toBe(1);
            expect(deleteLogs[0].description).toContain("Deleted assessment");
        });

        it("records audit log when teacher records daily attendance", async () => {
            const token = tokenFor(ROLES.TEACHER, scenario.facultyUserId);
            const today = new Date().toISOString().slice(0, 10);

            const res = await reqApi("POST", "/attendance", {
                classSubjectId: scenario.classSubjectId,
                date: today,
                quarter: 1,
                entries: [{ enrollmentId: scenario.enrollmentId, status: "present" }],
            }, token);
            expect(res.status).toBe(200);

            const logs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.ATTENDANCE_RECORDED, `${scenario.classSubjectId}_${today}`]
            );
            expect(logs.length).toBe(1);
            const log = logs[0];
            expect(Number(log.actorUserId)).toBe(scenario.facultyUserId);
            expect(log.entityType).toBe(AUDIT_ENTITY_TYPES.ATTENDANCE);
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            expect(meta.present).toBe(1);
            expect(meta.absent).toBe(0);
        });

        it("records audit log when teacher submits quarterly grades", async () => {
            const token = tokenFor(ROLES.TEACHER, scenario.facultyUserId);
            const res = await reqApi(
                "POST",
                `/student-records/class-subjects/${scenario.classSubjectId}/quarter/1/submit`,
                undefined,
                token
            );
            expect(res.status).toBe(200);

            const logs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND entityId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.GRADE_SUBMITTED, String(scenario.classSubjectId)]
            );
            expect(logs.length).toBe(1);
            const log = logs[0];
            expect(Number(log.actorUserId)).toBe(scenario.facultyUserId);
            expect(log.entityType).toBe(AUDIT_ENTITY_TYPES.GRADE_SUBMISSION);
            expect(Number(log.quarter)).toBe(1);
            expect(log.status).toBe("success");
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            expect(meta.submissionType).toBe("subject");
            expect(meta.totalStudents).toBeGreaterThanOrEqual(1);
        });

        it("records audit log when register enrols a student into a classroom", async () => {
            const registerToken = tokenFor(ROLES.TEACHER, registerUserId);

            // Create a fresh candidate student
            const studentUserId = await insert(
                connection,
                "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)",
                [`student.new.${scenario.suffix}@test.local`, "test-hash", ROLES.STUDENT, "active"]
            );
            const studentId = await insert(
                connection,
                `INSERT INTO students(userId, email, lrn, firstname, lastname, sex, status)
                 VALUES(?,?,?,?,?,?,?)`,
                [studentUserId, `student.new.${scenario.suffix}@test.local`, `8${scenario.suffix}`.slice(0, 20), "New", "Cand", "Male", "active"]
            );

            const enrollRes = await reqApi("POST", "/enrollments", {
                studentId,
                classId: scenario.classroomId,
                schoolYearId: scenario.schoolYearId,
                gradeLevel: scenario.gradeLevel,
                subjectIds: [scenario.subjectId],
            }, registerToken);
            expect(enrollRes.status).toBe(201);

            const logs = await select(
                connection,
                "SELECT * FROM activity_audit_logs WHERE action = ? AND classroomId = ? ORDER BY id DESC LIMIT 1",
                [AUDIT_ACTIONS.STUDENT_ENROLLED, scenario.classroomId]
            );
            expect(logs.length).toBe(1);
            const log = logs[0];
            expect(Number(log.actorUserId)).toBe(registerUserId);
            expect(log.actorRole).toBe("register");
            expect(log.entityType).toBe(AUDIT_ENTITY_TYPES.ENROLLMENT);
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            expect(meta.studentId).toBe(studentId);
            expect(meta.isTransfer).toBe(false);
        });
    });

    describe("Access Control & Security for Audit Endpoints", () => {
        it("allows admin access to audit logs and statistics", async () => {
            const adminToken = tokenFor(ROLES.ADMIN, adminUserId);

            const listRes = await reqApi("GET", "/activity-audit?limit=10", undefined, adminToken);
            expect(listRes.status).toBe(200);
            expect(listRes.body.data.logs).toBeDefined();
            expect(Array.isArray(listRes.body.data.logs)).toBe(true);
            expect(listRes.body.data.total).toBeGreaterThanOrEqual(1);

            const statsRes = await reqApi("GET", "/activity-audit/stats", undefined, adminToken);
            expect(statsRes.status).toBe(200);
            expect(statsRes.body.data.total).toBeGreaterThanOrEqual(1);
            expect(statsRes.body.data.byRole).toBeDefined();
            expect(statsRes.body.data.byAction).toBeDefined();
            expect(statsRes.body.data.byUser).toBeDefined();
        });

        it("denies access to non-admin roles (403 Forbidden)", async () => {
            const teacherToken = tokenFor(ROLES.TEACHER, scenario.facultyUserId);
            const studentToken = tokenFor(ROLES.STUDENT, scenario.userId);

            const resTeacher = await reqApi("GET", "/activity-audit", undefined, teacherToken);
            expect(resTeacher.status).toBe(403);

            const resStudent = await reqApi("GET", "/activity-audit", undefined, studentToken);
            expect(resStudent.status).toBe(403);
        });

        it("denies unauthenticated access (401 Unauthorized)", async () => {
            const res = await reqApi("GET", "/activity-audit");
            expect(res.status).toBe(401);
        });
    });

    describe("Audit Filtering, Pagination, and Details", () => {
        it("supports filtering by action, actorRole, and search", async () => {
            const adminToken = tokenFor(ROLES.ADMIN, adminUserId);

            // Filter by action
            const actionRes = await reqApi(
                "GET",
                `/activity-audit?action=${AUDIT_ACTIONS.REPORT_CARD_GENERATED}`,
                undefined,
                adminToken
            );
            expect(actionRes.status).toBe(200);
            expect(actionRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
            for (const item of actionRes.body.data.logs) {
                expect(item.action).toBe(AUDIT_ACTIONS.REPORT_CARD_GENERATED);
            }

            // Filter by actorRole
            const roleRes = await reqApi("GET", "/activity-audit?actorRole=register", undefined, adminToken);
            expect(roleRes.status).toBe(200);
            expect(roleRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
            for (const item of roleRes.body.data.logs) {
                expect(item.actorRole).toBe("register");
            }

            // Search by text
            const searchRes = await reqApi("GET", `/activity-audit?search=assessment`, undefined, adminToken);
            expect(searchRes.status).toBe(200);
            expect(searchRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
        });

        it("fetches single audit log details by ID", async () => {
            const adminToken = tokenFor(ROLES.ADMIN, adminUserId);

            const listRes = await reqApi("GET", "/activity-audit?limit=1", undefined, adminToken);
            expect(listRes.status).toBe(200);
            const targetLog = listRes.body.data.logs[0];
            expect(targetLog).toBeDefined();

            const detailRes = await reqApi("GET", `/activity-audit/${targetLog.id}`, undefined, adminToken);
            expect(detailRes.status).toBe(200);
            expect(detailRes.body.data.id).toBe(targetLog.id);
            expect(detailRes.body.data.action).toBe(targetLog.action);
        });
    });
});
