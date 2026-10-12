import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { getTestConnection } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import { getStudentReportCardService } from "../src/service/studentsReportCard.js";
import { clearAllFromClassService } from "../src/service/enrollments.js";
import {
    archiveClassroomService,
    setClassAdviserService,
    updateClassroomService,
} from "../src/service/classrooms.js";
import { getNumQuarters } from "../src/service/academicSettings.js";

/**
 * Audit F-1 — the SF9 report card used to inner-join live classrooms /
 * class_teacher / teachers, so archiving a classroom (which deletes its
 * class_teacher row) made a finalized report card return 404.
 */
describe("SF9 report card after classroom archival (F-1)", () => {
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

    it("returns the finalized report card after the classroom is cleared and archived", async () => {
        scenario = await createScenario(connection);
        await setClassAdviserService(scenario.classroomId, scenario.teacherId);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        // Semester-end flow: clear the operational data, then archive the class.
        const cleared = await clearAllFromClassService(scenario.classroomId);
        expect(cleared).toBe(1);
        await archiveClassroomService(scenario.classroomId);

        const card = await getStudentReportCardService(scenario.enrollmentId);

        expect(card.students).not.toBeNull();
        // Historical values come from the frozen record, not the (now gone) live joins.
        expect(card.students.classSection).toBe(scenario.section);
        expect(card.students.classGradeLevel).toBe(scenario.gradeLevel);
        expect(card.students.classAdviser).toBe(scenario.adviserName);
        expect(card.students.schoolYear).toBe(`${scenario.startYear}-${scenario.endYear}`);

        // The frozen subject grades are still rendered. (DECIMAL columns come
        // back from the driver as strings — pre-existing behaviour.)
        const subject = card.subjects.find((s) => s.name === scenario?.subjectName);
        expect(subject).toBeDefined();
        expect(Number(subject?.quarters.q1)).toBe(88);
        expect(subject?.finalGrades).not.toBeNull();
    });

    it("keeps the historical section and adviser after live assignments change", async () => {
        scenario = await createScenario(connection);
        const frozenAdviser = `Frozen Adviser ${scenario.suffix.slice(-6)}`.slice(0, 50);
        await finalizeScenario(connection, scenario, {
            quarters: numQuarters,
            adviserName: frozenAdviser,
        });

        // Mutate the LIVE classroom + adviser AFTER finalization.
        await updateClassroomService(scenario.classroomId, {
            section: `LIVE-${scenario.suffix.slice(-8)}`.slice(0, 20),
            gradeLevel: 9,
        });
        await setClassAdviserService(scenario.classroomId, null);

        const card = await getStudentReportCardService(scenario.enrollmentId);

        // Snapshot wins; no live value is substituted for a frozen one.
        expect(card.students.classSection).toBe(scenario.section);
        expect(card.students.classGradeLevel).toBe(scenario.gradeLevel);
        expect(card.students.classAdviser).toBe(frozenAdviser);
    });

    it("stays retrievable after the classroom row is hard-deleted", async () => {
        scenario = await createScenario(connection);
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        // Simulates a structure wipe: the classrooms row is gone (its
        // class_subjects / class_students / attendance cascade away).
        await connection.execute("DELETE FROM classrooms WHERE id = ?", [scenario.classroomId]);

        const card = await getStudentReportCardService(scenario.enrollmentId);
        expect(card.students.classSection).toBe(scenario.section);
        expect(card.students.classGradeLevel).toBe(scenario.gradeLevel);
        expect(card.students.classAdviser).toBe(scenario.adviserName);
    });

    it("reports not-found instead of fabricating a card when nothing is resolvable", async () => {
        scenario = await createScenario(connection);
        // No frozen record AND the classroom row is gone: there is no section,
        // grade level or adviser to report, so the original 404 must stand.
        await connection.execute("DELETE FROM classrooms WHERE id = ?", [scenario.classroomId]);

        await expect(getStudentReportCardService(scenario.enrollmentId)).rejects.toThrow("Student Not Found");
    });

    it("still reports an unfinalized current year from the live joins", async () => {
        scenario = await createScenario(connection);
        await setClassAdviserService(scenario.classroomId, scenario.teacherId);

        // No frozen record: the live classroom/adviser are the correct source.
        const card = await getStudentReportCardService(scenario.enrollmentId);
        expect(card.students.classSection).toBe(scenario.section);
        expect(card.students.classGradeLevel).toBe(scenario.gradeLevel);
        // Live adviser name is resolved from the class_teacher join (not the
        // snapshot, which does not exist for this year).
        expect(card.students.classAdviser).not.toBe("");
        expect(card.students.classAdviser).not.toBe(scenario.adviserName);
    });
});
