import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, count } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import { getStudentAcademicHistoryService, getStudentProspectusService } from "../src/service/studentClasses.js";
import { clearAllFromClassService } from "../src/service/enrollments.js";
import { getStudentByClassroomIdService } from "../src/service/students.js";
import { getNumQuarters } from "../src/service/academicSettings.js";

/**
 * Audit F-2 — the history reader filtered `enrollments.status = 'enrolled'`, so
 * the semester-end cleanup (which marks enrollments 'completed') made the whole
 * school year disappear from the prospectus / academic-history views even though
 * the frozen record was intact.
 */
describe("completed enrollment history (F-2)", () => {
    let connection: PoolConnection;
    let scenario: Scenario | null = null;
    let numQuarters = 4;

    beforeAll(async () => {
        connection = await getTestConnection();
        numQuarters = await getNumQuarters();
    });

    afterEach(async () => {
        if (scenario) {
            await teardownScenario(connection, scenario);
            scenario = null;
        }
    });

    afterAll(() => {
        connection.release();
    });

    it("keeps a completed school year in the academic-history view", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const cleared = await clearAllFromClassService(scenario.classroomId);
        expect(cleared).toBe(1);

        // Sanity: the cleanup really did mark it completed.
        const status = await count(
            connection,
            "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'completed'",
            [scenario.enrollmentId]
        );
        expect(status).toBe(1);

        const history = await getStudentAcademicHistoryService(scenario.studentId);
        const entry = history.classes.find((c) => c.enrollmentId === scenario?.enrollmentId);

        expect(entry).toBeDefined();
        // Frozen-record branch: section/grade/adviser come from the snapshot.
        expect(entry?.section).toBe(scenario.section);
        expect(entry?.gradeLevel).toBe(scenario.gradeLevel);
        expect(entry?.adviser).toBe(scenario.adviserName);
        expect(entry?.schoolYear).toBe(`${scenario.startYear}-${scenario.endYear}`);
        expect(entry?.subjects.length).toBeGreaterThan(0);
    });

    it("keeps a completed school year in the student prospectus", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });
        await clearAllFromClassService(scenario.classroomId);

        const prospectus = await getStudentProspectusService(scenario.userId);
        const entry = prospectus.classes.find((c) => c.enrollmentId === scenario?.enrollmentId);
        expect(entry).toBeDefined();
        expect(entry?.section).toBe(scenario.section);
    });

    it("does not treat a completed enrollment as an active enrollment", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });
        await clearAllFromClassService(scenario.classroomId);

        // The class roster (active-enrollment reader) must stay restricted.
        const roster = await getStudentByClassroomIdService(scenario.classroomId);
        expect(roster.some((s) => s.enrollmentId === scenario?.enrollmentId)).toBe(false);
    });

    it("still excludes unenrolled school years from history", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        // A student who left (bulk remove / transfer) is not history.
        await connection.execute("UPDATE enrollments SET status = 'unenrolled' WHERE id = ?", [
            scenario.enrollmentId,
        ]);

        const history = await getStudentAcademicHistoryService(scenario.studentId);
        expect(history.classes.some((c) => c.enrollmentId === scenario?.enrollmentId)).toBe(false);

        // ...but the row is only excluded, not destroyed.
        const remaining = await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ?", [
            scenario.enrollmentId,
        ]);
        expect(remaining).toBe(1);
    });

    it("keeps the academic-history response contract", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const history = await getStudentAcademicHistoryService(scenario.studentId);

        expect(Object.keys(history).sort()).toEqual(["classes", "student"]);
        expect(Object.keys(history.student).sort()).toEqual(["email", "fullname", "id", "lrn"]);

        const entry = history.classes.find((c) => c.enrollmentId === scenario?.enrollmentId);
        expect(entry).toBeDefined();
        if (!entry) return;

        expect(Object.keys(entry).sort()).toEqual(
            ["adviser", "classId", "enrollmentId", "generalAverage", "gradeLevel", "numQuarters", "schoolYear", "schoolYearId", "section", "subjects"].sort()
        );
    });
});
