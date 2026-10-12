import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { count, getTestConnection } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import { clearAllClassroomsService, clearAllFromClassService } from "../src/service/enrollments.js";
import { getNumQuarters } from "../src/service/academicSettings.js";
import { ConflictError } from "../src/middleware/errors.js";

/**
 * Audit F-4 — the cleanup deleted scores/attendance/enrollment links (and the
 * submission ledger) with no check that the frozen snapshot existed, so
 * unfinalized grades could be destroyed silently.
 */
describe("semester-end cleanup precondition (F-4)", () => {
    let connection: PoolConnection;
    const scenarios: Scenario[] = [];
    let numQuarters = 4;
    let originalActiveYearId: number | null = null;

    beforeAll(async () => {
        connection = await getTestConnection();
        numQuarters = await getNumQuarters();
    });

    async function track(): Promise<Scenario> {
        const scenario = await createScenario(connection);
        scenarios.push(scenario);
        return scenario;
    }

    afterEach(async () => {
        // Restore the active school year if a test flipped it.
        if (originalActiveYearId !== null) {
            await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
            await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [originalActiveYearId]);
            originalActiveYearId = null;
        }

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

    it("rejects cleanup when the enrollment was never finalized", async () => {
        const scenario = await track();

        await expect(clearAllFromClassService(scenario.classroomId)).rejects.toBeInstanceOf(ConflictError);

        // Nothing may be deleted by a rejected cleanup.
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollment_details WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM class_students WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'enrolled'", [scenario.enrollmentId])).toBe(1);
    });

    it("rejects cleanup when only some configured quarters are submitted", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters - 1 });

        await expect(clearAllFromClassService(scenario.classroomId)).rejects.toBeInstanceOf(ConflictError);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
    });

    it("rejects cleanup when the record exists but its subject grades are missing", async () => {
        const scenario = await track();
        // Record + full submission ledger, but no subject grade rows at all.
        await finalizeScenario(connection, scenario, { quarters: numQuarters, withSubjects: false });

        await expect(clearAllFromClassService(scenario.classroomId)).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects cleanup when a subject row exists but holds no grade", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters, nullGrades: true });

        await expect(clearAllFromClassService(scenario.classroomId)).rejects.toBeInstanceOf(ConflictError);
    });

    it("clears the classroom when every required snapshot is complete", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const cleared = await clearAllFromClassService(scenario.classroomId);
        expect(cleared).toBe(1);

        // Operational data is gone...
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(0);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollment_details WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(0);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM class_students WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(0);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM assessments WHERE classSubjectId = ?", [scenario.classSubjectId])).toBe(0);

        // ...the enrollment becomes completed history...
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'completed'", [scenario.enrollmentId])).toBe(1);

        // ...and the frozen snapshot survives untouched.
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_academic_records WHERE id = ?", [scenario.recordId])).toBe(1);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_academic_record_subjects WHERE recordId = ?", [scenario.recordId])).toBe(1);
    });

    it("retains the historical quarter-submission ledger", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        await clearAllFromClassService(scenario.classroomId);

        const submitted = await count(
            connection,
            "SELECT COUNT(*) AS cnt FROM student_academic_record_quarters WHERE recordId = ? AND status = 'submitted'",
            [scenario.recordId]
        );
        expect(submitted).toBe(numQuarters);

        // The audit trail (who/when) is kept too.
        const withAudit = await count(
            connection,
            "SELECT COUNT(*) AS cnt FROM student_academic_record_quarters WHERE recordId = ? AND submittedAt IS NOT NULL",
            [scenario.recordId]
        );
        expect(withAudit).toBe(numQuarters);
    });

    it("rolls back every change when a statement fails mid-cleanup", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        // Inject a deterministic failure AFTER the first deletes have run
        // (student_scores / student_attendance / enrollment_details are deleted
        // before class_students).
        await connection.query(
            `CREATE TRIGGER test_block_class_students_delete BEFORE DELETE ON class_students
             FOR EACH ROW
             BEGIN
               IF OLD.enrollmentId = ${Number(scenario.enrollmentId)} THEN
                 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test-injected cleanup failure';
               END IF;
             END`
        );

        try {
            await expect(clearAllFromClassService(scenario.classroomId)).rejects.toBeTruthy();

            // Transaction rolled back: every pre-failure delete is undone.
            expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
            expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_attendance WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
            expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollment_details WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
            expect(await count(connection, "SELECT COUNT(*) AS cnt FROM class_students WHERE enrollmentId = ?", [scenario.enrollmentId])).toBe(1);
            expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'enrolled'", [scenario.enrollmentId])).toBe(1);
        } finally {
            await connection.query("DROP TRIGGER IF EXISTS test_block_class_students_delete");
        }
    });

    it("rejects the all-classroom cleanup before clearing any classroom", async () => {
        const complete = await track();
        const incomplete = await track();

        await finalizeScenario(connection, complete, { quarters: numQuarters });
        // `incomplete` is intentionally left without a frozen record.

        // Point the active school year at these two scenarios only, so the
        // all-classroom cleanup sees exactly one safe and one unsafe class.
        const [activeRows] = await connection.query("SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1");
        const active = (activeRows as { id: number }[])[0];
        originalActiveYearId = active ? Number(active.id) : null;

        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [complete.schoolYearId]);
        await connection.execute("UPDATE enrollments SET schoolYearId = ? WHERE id IN (?, ?)", [
            complete.schoolYearId,
            complete.enrollmentId,
            incomplete.enrollmentId,
        ]);

        await expect(clearAllClassroomsService()).rejects.toBeInstanceOf(ConflictError);

        // Fail-fast: the safe classroom was NOT cleared.
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'enrolled'", [complete.enrollmentId])).toBe(1);
        expect(await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [complete.enrollmentId])).toBe(1);
    });
});
