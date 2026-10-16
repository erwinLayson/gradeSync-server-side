import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, insert } from "./helpers/db.js";

import { getStudentListService } from "../src/service/students.js";
import { getAllEnrollmentRecordByStudentId } from "../src/service/enrollments.js";

import type { StudentListQuery } from "../src/constant/students.js";

/**
 * The student registry is paginated / filtered / sorted in SQL (see
 * Students.getStudentsPage and getStudentListService). These tests insert their
 * own uniquely-prefixed learners so the assertions never depend on seeded data.
 */

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const PREFIX = `zz${RUN}`;

// A complete default query; individual tests override one field at a time.
function q(overrides: Partial<StudentListQuery> = {}): StudentListQuery {
    return {
        status: "active",
        page: 1,
        pageSize: 25,
        sort: "name",
        dir: "asc",
        ...overrides,
    };
}

describe("student registry list (server-side)", () => {
    let connection: PoolConnection;
    let createdUserIds: number[] = [];
    let createdStudentIds: number[] = [];
    let createdClassroomIds: number[] = [];
    let createdSchoolYearIds: number[] = [];
    let createdEnrollmentIds: number[] = [];

    beforeAll(async () => {
        connection = await getTestConnection();
    });

    afterEach(async () => {
        // FK-safe teardown: enrollments -> class_students -> students -> users,
        // then classrooms and school years.
        for (const id of createdEnrollmentIds) {
            await connection.execute("DELETE FROM class_students WHERE enrollmentId = ?", [id]);
            await connection.execute("DELETE FROM enrollment_details WHERE enrollmentId = ?", [id]);
            await connection.execute("DELETE FROM enrollments WHERE id = ?", [id]);
        }
        for (const id of createdStudentIds) {
            await connection.execute("DELETE FROM students WHERE id = ?", [id]);
        }
        for (const id of createdUserIds) {
            await connection.execute("DELETE FROM users WHERE id = ?", [id]);
        }
        for (const id of createdClassroomIds) {
            await connection.execute("DELETE FROM classrooms WHERE id = ?", [id]);
        }
        for (const id of createdSchoolYearIds) {
            await connection.execute("DELETE FROM schoolyear WHERE id = ?", [id]);
        }
        createdUserIds = [];
        createdStudentIds = [];
        createdClassroomIds = [];
        createdSchoolYearIds = [];
        createdEnrollmentIds = [];
    });

    afterAll(() => {
        connection.release();
    });

    async function makeStudent(index: number, status: "active" | "inactive" = "active"): Promise<number> {
        const email = `${PREFIX}.${index}@test.local`;
        const userId = await insert(connection, "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)", [
            email,
            "test-hash",
            "student",
            "active",
        ]);
        createdUserIds.push(userId);

        const studentId = await insert(
            connection,
            `INSERT INTO students(userId, email, lrn, firstname, middlename, lastname, sex, status)
             VALUES(?,?,?,?,?,?,?,?)`,
            [userId, email, `${PREFIX}LRN${index}`, `${PREFIX}First`, "M", `Last${index}`, "Male", status]
        );
        createdStudentIds.push(studentId);
        return studentId;
    }

    async function enroll(studentId: number): Promise<number> {
        const classroomId = await insert(
            connection,
            "INSERT INTO classrooms(section, gradeLevel, status) VALUES(?,?, 'active')",
            [`SEC-${PREFIX}-${createdClassroomIds.length}`.slice(0, 20), 7]
        );
        createdClassroomIds.push(classroomId);

        const schoolYearId = await insert(
            connection,
            "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,0)",
            ["2050", "2051"]
        );
        createdSchoolYearIds.push(schoolYearId);

        const enrollmentId = await insert(
            connection,
            "INSERT INTO enrollments(classId, schoolYearId, studentId, status) VALUES(?,?,?, 'enrolled')",
            [classroomId, schoolYearId, studentId]
        );
        createdEnrollmentIds.push(enrollmentId);
        return classroomId;
    }

    it("searches by name and reports the true total", async () => {
        await makeStudent(1);
        await makeStudent(2);

        const result = await getStudentListService(q({ search: PREFIX }));

        expect(result.total).toBe(2);
        expect(result.students).toHaveLength(2);
        // Every returned learner matches the unique prefix, and the mapped shape
        // carries the fields the table renders.
        for (const student of result.students) {
            expect(student.fullname).toContain(PREFIX);
            expect(student.lrn).toBeDefined();
            expect(student.email).toContain(PREFIX);
        }
    });

    it("paginates without fetching the whole roll", async () => {
        await makeStudent(1);
        await makeStudent(2);
        await makeStudent(3);

        // The service passes pageSize straight through to LIMIT (the controller
        // clamps the public API), so a tidy page size exercises real slicing.
        const firstPage = await getStudentListService(q({ search: PREFIX, pageSize: 2, page: 1 }));
        expect(firstPage.total).toBe(3);
        expect(firstPage.students).toHaveLength(2);

        const secondPage = await getStudentListService(q({ search: PREFIX, pageSize: 2, page: 2 }));
        expect(secondPage.total).toBe(3);
        expect(secondPage.students).toHaveLength(1);

        // The two pages never overlap.
        const firstIds = firstPage.students.map((s) => s.id);
        const secondIds = secondPage.students.map((s) => s.id);
        expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    });

    it("filters by status (soft-deleted learners are hidden unless requested)", async () => {
        await makeStudent(1, "active");
        await makeStudent(2, "inactive");

        const active = await getStudentListService(q({ search: PREFIX, status: "active" }));
        expect(active.total).toBe(1);
        expect(active.students[0]?.status).toBe("active");

        const inactive = await getStudentListService(q({ search: PREFIX, status: "inactive" }));
        expect(inactive.total).toBe(1);
        expect(inactive.students[0]?.status).toBe("inactive");

        const all = await getStudentListService(q({ search: PREFIX, status: "all" }));
        expect(all.total).toBe(2);
    });

    it("filters by active classroom", async () => {
        const enrolledId = await makeStudent(1);
        await makeStudent(2);
        const classroomId = await enroll(enrolledId);

        const result = await getStudentListService(q({ search: PREFIX, status: "all", classId: classroomId }));
        expect(result.total).toBe(1);
        expect(result.students[0]?.id).toBe(enrolledId);

        // Searching in a classroom the learner is not in yields nothing.
        const other = await getStudentListService(q({ search: PREFIX, status: "all", classId: 999999999 }));
        expect(other.total).toBe(0);
    });

    it("sorts by name ascending and descending", async () => {
        await makeStudent(1);
        await makeStudent(2);
        await makeStudent(3);

        const asc = await getStudentListService(q({ search: PREFIX, sort: "name", dir: "asc" }));
        const desc = await getStudentListService(q({ search: PREFIX, sort: "name", dir: "desc" }));

        const ascNames = asc.students.map((s) => s.fullname);
        const descNames = desc.students.map((s) => s.fullname);
        expect(ascNames).toEqual([...ascNames].sort());
        expect(descNames).toEqual([...ascNames].reverse());
    });
});

describe("SF10 / Form-137 enrollment ordering", () => {
    let connection: PoolConnection;
    let userId: number | null = null;
    let studentId: number | null = null;
    const schoolYears: number[] = [];
    const classrooms: number[] = [];
    const enrollments: number[] = [];

    beforeAll(async () => {
        connection = await getTestConnection();
    });

    afterEach(async () => {
        for (const id of enrollments) {
            await connection.execute("DELETE FROM enrollments WHERE id = ?", [id]);
        }
        for (const id of classrooms) {
            await connection.execute("DELETE FROM classrooms WHERE id = ?", [id]);
        }
        for (const id of schoolYears) {
            await connection.execute("DELETE FROM schoolyear WHERE id = ?", [id]);
        }
        if (studentId !== null) {
            await connection.execute("DELETE FROM students WHERE id = ?", [studentId]);
        }
        if (userId !== null) {
            await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
        }
        schoolYears.length = 0;
        classrooms.length = 0;
        enrollments.length = 0;
        studentId = null;
        userId = null;
    });

    afterAll(() => {
        connection.release();
    });

    it("lists school years oldest-first regardless of insert order", async () => {
        const email = `${PREFIX}.sf10@test.local`;
        userId = await insert(connection, "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)", [
            email,
            "test-hash",
            "student",
            "active",
        ]);
        studentId = await insert(
            connection,
            `INSERT INTO students(userId, email, lrn, firstname, middlename, lastname, sex, status)
             VALUES(?,?,?,?,?,?,?,?)`,
            [userId, email, `${PREFIX}SF10`, `${PREFIX}First`, "M", "SF10", "Male", "active"]
        );

        // Insert the newer year first, then the older one: without ORDER BY the
        // SF10 could print them out of order and mislabel "last school year".
        const years = [
            { start: "2054", end: "2055" },
            { start: "2052", end: "2053" },
        ];
        for (const year of years) {
            const syId = await insert(
                connection,
                "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,0)",
                [year.start, year.end]
            );
            schoolYears.push(syId);
            const classId = await insert(
                connection,
                "INSERT INTO classrooms(section, gradeLevel, status) VALUES(?,?, 'active')",
                [`GR${year.start}`.slice(0, 20), 7]
            );
            classrooms.push(classId);
            const enrollmentId = await insert(
                connection,
                "INSERT INTO enrollments(classId, schoolYearId, studentId, status) VALUES(?,?,?, 'enrolled')",
                [classId, syId, studentId]
            );
            enrollments.push(enrollmentId);
        }

        const records = await getAllEnrollmentRecordByStudentId(studentId);
        const orderedYears = records.map((r) => r.schoolYear);
        expect(orderedYears).toEqual(["2052-2053", "2054-2055"]);
    });
});
