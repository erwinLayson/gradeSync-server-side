import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import jwt from "jsonwebtoken";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import app from "../src/app.js";
import getEnv from "../src/helper/getEnv.js";
import { getTestConnection } from "./helpers/db.js";
import { FACULTY_ROLES, type FacultyRole } from "../src/constant/faculties.js";
import { ROLES } from "../src/constant/users.js";

function tokenFor(role: string = "admin", id = 1): string {
    return jwt.sign({ id, email: `${role}@test.local`, role }, getEnv("JWT_SECRET"));
}

describe("Classroom Multiple Subject and Teacher Assignment (Backend Integration)", () => {
    let server: Server;
    let baseUrl: string;
    let connection: PoolConnection;

    // Track resources created across tests for cleanup
    const createdClassroomIds: number[] = [];
    const createdSubjectIds: number[] = [];
    const createdFacultyIds: number[] = [];
    const createdUserIds: number[] = [];

    beforeAll(async () => {
        connection = await getTestConnection();
        server = app.listen(0);
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}/api`;
    });

    afterAll(async () => {
        if (connection) {
            for (const classId of createdClassroomIds) {
                await connection.execute("DELETE FROM class_subjects WHERE classId = ?", [classId]);
                await connection.execute("DELETE FROM classrooms WHERE id = ?", [classId]);
            }
            for (const subjectId of createdSubjectIds) {
                await connection.execute("DELETE FROM faculty_subject_assignment WHERE subjectId = ?", [subjectId]);
                await connection.execute("DELETE FROM subjects WHERE id = ?", [subjectId]);
            }
            for (const facultyId of createdFacultyIds) {
                await connection.execute("DELETE FROM faculty_subject_assignment WHERE facultyId = ?", [facultyId]);
                await connection.execute("DELETE FROM class_subjects WHERE facultyId = ?", [facultyId]);
                await connection.execute("DELETE FROM faculties WHERE id = ?", [facultyId]);
            }
            for (const userId of createdUserIds) {
                await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
            }
            connection.release();
        }
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    async function api(method: string, path: string, body?: unknown, role = "admin") {
        const headers: Record<string, string> = {
            Cookie: `login_token=${tokenFor(role)}`,
        };
        const options: RequestInit = {
            method,
            headers,
        };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }
        const res = await fetch(`${baseUrl}${path}`, options);
        const json = await res.json().catch(() => ({}));
        return { status: res.status, body: json };
    }

    async function createTestClassroom(section: string, gradeLevel = 10): Promise<number> {
        const [res] = await connection.execute<ResultSetHeader>(
            "INSERT INTO classrooms (section, gradeLevel, status) VALUES (?, ?, 'active')",
            [section, gradeLevel]
        );
        createdClassroomIds.push(res.insertId);
        return res.insertId;
    }

    async function createTestFaculty(firstname: string, lastname: string, role: FacultyRole = FACULTY_ROLES.TEACHER): Promise<number> {
        const email = `fac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.local`;
        const userRole = role === FACULTY_ROLES.TEACHER ? ROLES.TEACHER : ROLES.TEACHER;
        const [userRes] = await connection.execute<ResultSetHeader>(
            "INSERT INTO users (email, password, role) VALUES (?, 'hash', ?)",
            [email, userRole]
        );
        createdUserIds.push(userRes.insertId);

        const [facRes] = await connection.execute<ResultSetHeader>(
            "INSERT INTO faculties (email, firstname, lastname, gender, role, userId) VALUES (?, ?, ?, 'Male', ?, ?)",
            [email, firstname, lastname, role, userRes.insertId]
        );
        createdFacultyIds.push(facRes.insertId);
        return facRes.insertId;
    }

    async function createTestSubject(name: string, code: string, unit = 3): Promise<number> {
        const [res] = await connection.execute<ResultSetHeader>(
            "INSERT INTO subjects (name, code, unit, hasComponents) VALUES (?, ?, ?, 0)",
            [name, code, unit]
        );
        createdSubjectIds.push(res.insertId);
        return res.insertId;
    }

    async function assignFacultyToSubjectPool(facultyId: number, subjectId: number): Promise<void> {
        await connection.execute(
            "INSERT INTO faculty_subject_assignment (facultyId, subjectId) VALUES (?, ?)",
            [facultyId, subjectId]
        );
    }

    it("allows adding multiple subjects to a classroom assigned to the same teacher", async () => {
        const classId = await createTestClassroom("Einstein-10");
        const teacherId = await createTestFaculty("Maria", "Curie");
        const subject1Id = await createTestSubject("Physics 1", `PHY_${Date.now()}`);
        const subject2Id = await createTestSubject("Chemistry 1", `CHM_${Date.now()}`);

        await assignFacultyToSubjectPool(teacherId, subject1Id);
        await assignFacultyToSubjectPool(teacherId, subject2Id);

        // 1. Add both subjects with the same teacher in one batch
        const postRes = await api("POST", "/classrooms/subjects", {
            newSubjects: [
                { classId, subjectId: subject1Id, facultyId: teacherId },
                { classId, subjectId: subject2Id, facultyId: teacherId },
            ],
        });

        expect(postRes.status).toBe(201);
        expect(postRes.body.success).toBe(true);

        // 2. Verify via GET /classrooms/:classroomId/faculties-subject
        const getRes = await api("GET", `/classrooms/${classId}/faculties-subject`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.data).toHaveLength(2);

        const assigned = getRes.body.data as Array<{
            facultyId: number;
            facultyFullname: string;
            subjectId: number;
            subjectName: string;
        }>;

        const sub1 = assigned.find((s) => s.subjectId === subject1Id);
        const sub2 = assigned.find((s) => s.subjectId === subject2Id);

        expect(sub1).toBeDefined();
        expect(sub1?.facultyId).toBe(teacherId);
        expect(sub1?.subjectName).toBe("Physics 1");

        expect(sub2).toBeDefined();
        expect(sub2?.facultyId).toBe(teacherId);
        expect(sub2?.subjectName).toBe("Chemistry 1");

        // 3. Verify directly in the database
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT classId, subjectId, facultyId FROM class_subjects WHERE classId = ? ORDER BY subjectId",
            [classId]
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]?.facultyId).toBe(teacherId);
        expect(rows[1]?.facultyId).toBe(teacherId);
    });

    it("ensures adding another subject to the same teacher preserves existing subject assignments", async () => {
        const classId = await createTestClassroom("Newton-10");
        const teacherId = await createTestFaculty("Isaac", "Newton");
        const algebraId = await createTestSubject("Algebra", `ALG_${Date.now()}`);
        const geometryId = await createTestSubject("Geometry", `GEO_${Date.now()}`);

        await assignFacultyToSubjectPool(teacherId, algebraId);
        await assignFacultyToSubjectPool(teacherId, geometryId);

        // Assign first subject
        const firstPost = await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId: algebraId, facultyId: teacherId }],
        });
        expect(firstPost.status).toBe(201);

        // Assign second subject to the same teacher later
        const secondPost = await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId: geometryId, facultyId: teacherId }],
        });
        expect(secondPost.status).toBe(201);

        // Verify both assignments exist and the first assignment was not removed or overwritten
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT classId, subjectId, facultyId FROM class_subjects WHERE classId = ? ORDER BY subjectId",
            [classId]
        );
        expect(rows).toHaveLength(2);
        const assignedSubjectIds = rows.map((r) => r.subjectId);
        expect(assignedSubjectIds).toContain(algebraId);
        expect(assignedSubjectIds).toContain(geometryId);
        expect(rows.every((r) => r.facultyId === teacherId)).toBe(true);
    });

    it("prevents duplicate assignments of the same teacher to the same subject in the same classroom", async () => {
        const classId = await createTestClassroom("Galileo-10");
        const teacherId = await createTestFaculty("Galileo", "Galilei");
        const subjectId = await createTestSubject("Astronomy", `AST_${Date.now()}`);

        await assignFacultyToSubjectPool(teacherId, subjectId);

        // First assignment succeeds
        const firstPost = await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId, facultyId: teacherId }],
        });
        expect(firstPost.status).toBe(201);

        // Attempting to assign the exact same teacher + subject in the same classroom returns 409 Conflict
        const duplicatePost = await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId, facultyId: teacherId }],
        });
        expect(duplicatePost.status).toBe(409);

        // Database still has exactly one record
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM class_subjects WHERE classId = ? AND subjectId = ? AND facultyId = ?",
            [classId, subjectId, teacherId]
        );
        expect(rows[0]?.total).toBe(1);
    });

    it("rolls back batch when a duplicate or constraint error occurs within the batch", async () => {
        const classId = await createTestClassroom("Tesla-10");
        const teacherId = await createTestFaculty("Nikola", "Tesla");
        const subA = await createTestSubject("Electricity", `ELE_${Date.now()}`);
        const subB = await createTestSubject("Magnetism", `MAG_${Date.now()}`);

        await assignFacultyToSubjectPool(teacherId, subA);
        await assignFacultyToSubjectPool(teacherId, subB);

        // Batch contains internal duplicates of subA
        const batchWithDup = await api("POST", "/classrooms/subjects", {
            newSubjects: [
                { classId, subjectId: subA, facultyId: teacherId },
                { classId, subjectId: subA, facultyId: teacherId },
            ],
        });
        expect(batchWithDup.status).toBe(409);

        // Verify transaction rolled back: subA has 0 rows inserted
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM class_subjects WHERE classId = ?",
            [classId]
        );
        expect(rows[0]?.total).toBe(0);
    });

    it("excludes already assigned subjects from GET /subjects/classrooms/:classId/faculties", async () => {
        const classId = await createTestClassroom("Bohr-10");
        const teacherId = await createTestFaculty("Niels", "Bohr");
        const assignedSub = await createTestSubject("Quantum 1", `QNT_${Date.now()}`);
        const unassignedSub = await createTestSubject("Optics 1", `OPT_${Date.now()}`);

        await assignFacultyToSubjectPool(teacherId, assignedSub);
        await assignFacultyToSubjectPool(teacherId, unassignedSub);

        // Assign Quantum 1
        await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId: assignedSub, facultyId: teacherId }],
        });

        // GET subjects not in class
        const res = await api("GET", `/subjects/classrooms/${classId}/faculties`);
        expect(res.status).toBe(200);

        const available = res.body.data as Array<{ subjectId: number }>;
        const availableSubjectIds = available.map((s) => s.subjectId);

        expect(availableSubjectIds).not.toContain(assignedSub);
        expect(availableSubjectIds).toContain(unassignedSub);
    });

    it("rejects assigning register-role faculty to a classroom subject", async () => {
        const classId = await createTestClassroom("Pascal-10");
        const registerId = await createTestFaculty("Blaise", "Pascal", FACULTY_ROLES.REGISTER);
        const subjectId = await createTestSubject("Theology", `THE_${Date.now()}`);

        const res = await api("POST", "/classrooms/subjects", {
            newSubjects: [{ classId, subjectId, facultyId: registerId }],
        });

        expect(res.status).toBe(409);

        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM class_subjects WHERE classId = ? AND facultyId = ?",
            [classId, registerId]
        );
        expect(rows[0]?.total).toBe(0);
    });
});
