import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { count, getTestConnection, insert } from "./helpers/db.js";
import { createScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";
import { createEnrollmentService, getAllEnrollmentRecordByStudentId } from "../src/service/enrollments.js";
import { StudentRecordPDFDetailsService } from "../src/service/studentRecord.js";
import { BadRequestError } from "../src/middleware/errors.js";

describe("Enrollment Grade Level Requirement & Monitoring", () => {
    let connection: PoolConnection;
    const scenarios: Scenario[] = [];
    const createdClassroomIds: number[] = [];

    beforeAll(async () => {
        connection = await getTestConnection();
    });

    async function track(): Promise<Scenario> {
        const scenario = await createScenario(connection);
        scenarios.push(scenario);
        return scenario;
    }

    afterEach(async () => {
        for (const cid of createdClassroomIds) {
            await connection.execute("DELETE FROM classrooms WHERE id = ?", [cid]);
        }
        createdClassroomIds.length = 0;

        while (scenarios.length > 0) {
            const scenario = scenarios.pop();
            if (scenario) {
                await teardownScenario(connection, scenario);
            }
        }
    });

    afterAll(() => {
        connection.release();
    });

    it("rejects enrollment when the classroom grade level does not match the chosen grade level", async () => {
        const scenario = await track();
        // scenario.classroomId is Grade 7 (from fixtures)

        // Create a new unenrolled student
        const email = `test.mismatch.${Date.now()}@test.local`;
        const userId = await insert(connection, "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)", [
            email,
            "hash",
            "student",
            "active",
        ]);
        const studentId = await insert(
            connection,
            "INSERT INTO students(userId, email, lrn, firstname, middlename, lastname, sex, status) VALUES(?,?,?,?,?,?,?,?)",
            [userId, email, `LRN${Date.now()}`.slice(0, 20), "Test", "M", "Mismatch", "Male", "active"]
        );

        // Attempting to enroll in classroom (Grade 7) with gradeLevel = 8
        await expect(
            createEnrollmentService({
                studentId,
                classId: scenario.classroomId,
                schoolYearId: scenario.schoolYearId,
                subjectIds: [scenario.subjectId],
                gradeLevel: 8,
            })
        ).rejects.toThrow(BadRequestError);
    });

    it("records grade level and allows monitoring via enrollment records", async () => {
        const scenario = await track();

        // Check getAllEnrollmentRecordByStudentId
        const records = await getAllEnrollmentRecordByStudentId(scenario.studentId);
        expect(records.length).toBeGreaterThanOrEqual(1);
        const record = records.find((r) => r.enrollmentId === scenario.enrollmentId);
        expect(record).toBeDefined();
        expect(record?.gradeLevel).toBe(scenario.gradeLevel);
        expect(record?.section).toBe(scenario.section);

        // Check StudentRecordPDFDetailsService returns gradeLevel even before frozen
        const studentRecord = await StudentRecordPDFDetailsService(scenario.studentId);
        const allEntries = [...studentRecord.academicRecord.semester1, ...studentRecord.academicRecord.semester2];
        const match = allEntries.find((e) => e.enrollmentId === scenario.enrollmentId);
        expect(match).toBeDefined();
        expect(match?.classGradeLevel).toBe(scenario.gradeLevel);
        expect(match?.classSection).toBe(scenario.section);
    });
});
