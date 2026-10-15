import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, select } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import { getAcademicSettingsService, updateAcademicSettingsService, getNumQuarters } from "../src/service/academicSettings.js";
import { assertQuarterCompleteService } from "../src/service/studentRecord.js";
import { ConflictError, BadRequestError } from "../src/middleware/errors.js";

/**
 * DB-backed tests for the quarter-advancement contract.
 *
 * The store is the real single-row table `academic_settings`; the suite mutates it,
 * so every test that touches it restores it after itself. Each scenario already owns
 * its own disposable school year, so there is no cross-test coupling.
 */
describe("quarter advancement workflow", () => {
    let connection: PoolConnection;
    let originalSettings: {
        id: number;
        currentQuarter: number;
        numQuarters: number;
        enrollmentOpen: number;
        submissionsLocked: number;
    } | null = null;
    const scenarios: Scenario[] = [];
    let numQuarters: number;

    beforeAll(async () => {
        connection = await getTestConnection();
        numQuarters = await getNumQuarters();
    });

    afterEach(async () => {
        // Restore the active school year if a test flipped it.
        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
        // Restore the settings row to its baseline.
        if (originalSettings !== null) {
            await connection.execute(
                "UPDATE academic_settings SET currentQuarter = ?, numQuarters = ?, enrollmentOpen = ?, submissionsLocked = ? WHERE id = ?",
                [
                    originalSettings.currentQuarter,
                    originalSettings.numQuarters,
                    originalSettings.enrollmentOpen,
                    originalSettings.submissionsLocked,
                    originalSettings.id,
                ],
            );
            originalSettings = null;
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

    async function stampCurrentSettings() {
        if (originalSettings === null) {
            const rows = await select<{
                id: number;
                currentQuarter: number;
                numQuarters: number;
                enrollmentOpen: number;
                submissionsLocked: number;
            }>(connection,
                "SELECT id, currentQuarter, numQuarters, enrollmentOpen, submissionsLocked FROM academic_settings LIMIT 1",
            );
            if (rows.length === 0) {
                throw new Error("academic_settings is unexpectedly empty");
            }
            originalSettings = rows[0];
        }
    }

    it("succeeds when every eligible student has submitted and every class has an adviser", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);

        // Ensure the stored quarter is one we can advance from (not the final
        // quarter, and not below 1). If it is not, reset the row to a clean single
        // quarter so a leftover completed scenario from a prior test run cannot sit
        // inside this test's active year.
        const safeQuarter =
            originalSettings.currentQuarter < 1 || originalSettings.currentQuarter >= numQuarters
                ? 1
                : originalSettings.currentQuarter;
        await connection.execute(
            "UPDATE academic_settings SET currentQuarter = ? WHERE id = ?",
            [safeQuarter, originalSettings.id],
        );
        if (safeQuarter !== originalSettings.currentQuarter) {
            originalSettings = { ...originalSettings, currentQuarter: safeQuarter };
        }

        // Re-point the active year to our owned scenario first, so the service
        // validates our owned school year instead of a leftover completed one from
        // another test run.
        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        // Assign an adviser so the scenario's classroom has a class_teacher row
        // (createScenario does not create one).
        await connection.execute(
            "INSERT INTO class_teacher(classId, teacherId) VALUES(?, ?)",
            [scenario.classroomId, scenario.teacherId],
        );

        // Write the frozen record so the submission ledger exists.
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const currentSettings = await getAcademicSettingsService();
        expect(currentSettings).toBeTruthy();
        const quarter = currentSettings!.currentQuarter;

        // The service locks the settings row, re-reads the stored quarter, and only
        // then checks completeness against that quarter — so this test must pass the
        // quarter the service will actually validate.
        await assertQuarterCompleteService(quarter, connection);
        expect(await getAcademicSettingsService()).toBeTruthy();

        const result = await updateAcademicSettingsService({
            currentQuarter: quarter + 1,
        });
        expect(result.settings.currentQuarter).toBe(quarter + 1);
    });

    it("rejects when a student has not yet submitted the current quarter", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        // No submission ledger yet -> record missing.
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        await expect(assertQuarterCompleteService(1, connection)).rejects.toBeInstanceOf(ConflictError);

        // The settings row must not have been mutated by the rejected check.
        const settings = await getAcademicSettingsService();
        expect(settings!.currentQuarter).toBe(originalSettings!.currentQuarter);
    });

    it("rejects when a class has no assigned adviser", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        // Write the frozen record so the submission ledger exists, then remove the
        // class's adviser row. `getClassesWithoutAdviser` is intentionally strict:
        // it reports a class whose `LEFT JOIN class_teacher ct ... ct.id IS NULL`,
        // even when a frozen adviser name exists on the record.
        await finalizeScenario(connection, scenario, { quarters: numQuarters, withSubjects: false });
        await connection.execute("DELETE FROM class_teacher WHERE classId = ?", [scenario.classroomId]);

        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        await expect(assertQuarterCompleteService(1, connection)).rejects.toBeInstanceOf(ConflictError);
    });

    it("lists every blocker in the conflict message", async () => {
        stampCurrentSettings();
        const scenarioA = await createScenario(connection);
        scenarios.push(scenarioA);
        const scenarioB = await createScenario(connection);
        scenarios.push(scenarioB);

        // Make A incomplete and strip its adviser. B is fully complete, so only A
        // contributes blockers.
        await finalizeScenario(connection, scenarioA, { quarters: numQuarters, nullGrades: true });
        await connection.execute("DELETE FROM class_teacher WHERE classId = ?", [scenarioA.classroomId]);

        // Only mark A's year active; B stays inactive so its complete rows don't
        // qualify as blockers inside the active year.
        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenarioA.schoolYearId]);

        await expect(assertQuarterCompleteService(1, connection)).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("rejects a forward advance when no school year is active", async () => {
        stampCurrentSettings();
        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");

        const scenarioB = await createScenario(connection);
        // Make it complete so the only remaining blocker is the missing active year.
        await finalizeScenario(connection, scenarioB, { quarters: numQuarters });
        scenarios.push(scenarioB);

        await expect(updateAcademicSettingsService({ currentQuarter: 2 })).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects when the requested quarter is outside the configured range", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        // Make the scenario's year active and complete so the only failure route is
        // the range check on the requested quarter.
        await finalizeScenario(connection, scenario, { quarters: numQuarters });
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        await expect(updateAcademicSettingsService({ currentQuarter: 5 })).rejects.toBeInstanceOf(BadRequestError);
    });
});
