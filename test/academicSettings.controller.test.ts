import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, insert, select } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import { getAcademicSettingsService, updateAcademicSettingsService, getNumQuarters, checkQuarter4DataExists } from "../src/service/academicSettings.js";
import { ConflictError, BadRequestError } from "../src/middleware/errors.js";

/**
 * Request-level contract tests for PATCH /academic-settings.
 *
 * These exercise the service (the authoritative validator) directly rather than
 * the express controller, so they stay fast and deterministic. The controller
 * re-uses the same service, so a service rejection is the contract the endpoint
 * honours.
 */
describe("PATCH /academic-settings request validation", () => {
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

        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
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
            originalSettings = rows[0] ?? null;
        }
    }

    it("rejects invalid quarter values sent by the controller", async () => {
        stampCurrentSettings();

        const invalid: Array<{ value: unknown; message: RegExp }> = [
            { value: null as unknown, message: /currentQuarter must be/ },
            { value: true as unknown, message: /currentQuarter must be/ },
            { value: false as unknown, message: /currentQuarter must be/ },
            { value: "Q2" as unknown, message: /currentQuarter must be/ },
            { value: "2.5" as unknown, message: /currentQuarter must be/ },
            { value: [2] as unknown, message: /currentQuarter must be/ },
            { value: { q: 2 } as unknown, message: /currentQuarter must be/ },
            { value: "  " as unknown, message: /currentQuarter must be/ },
            { value: -1 as unknown, message: /currentQuarter must be/ },
            { value: 0 as unknown, message: /currentQuarter must be/ },
            { value: 5 as unknown, message: /currentQuarter must be/ },
        ];

        for (const entry of invalid) {
            await expect(updateAcademicSettingsService({ currentQuarter: entry.value as unknown as number })).rejects.toThrow(entry.message);
        }
    });

    it("rejects a skip that jumps over an intermediate quarter", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const [currentActive] = await select<{ id: number }>(connection, "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1");
        if (currentActive) {
            await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE id = ?", [currentActive.id]);
        }
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        await expect(updateAcademicSettingsService({ currentQuarter: 3 })).rejects.toThrow(/Cannot skip quarters/);
    });

    it("allows a same-quarter request as an idempotent no-op", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const [currentActive] = await select<{ id: number }>(connection, "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1");
        if (currentActive) {
            await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE id = ?", [currentActive.id]);
        }
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        const before = await getAcademicSettingsService();
        await expect(updateAcademicSettingsService({ currentQuarter: before?.currentQuarter ?? 1 })).resolves.toBeDefined();
    });

    it("allows a deliberate rewind as a correction (no completeness gate)", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        // Advance all the way to Q4, submit everything, then rewind.
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const [currentActive] = await select<{ id: number }>(connection, "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1");
        if (currentActive) {
            await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE id = ?", [currentActive.id]);
        }
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        // No completeness check applies to a rewind, so this must succeed.
        const result = await updateAcademicSettingsService({ currentQuarter: 1 });
        expect(result.settings.currentQuarter).toBe(1);
    });

    it("rejects when the current quarter is already the final configured quarter", async () => {
        stampCurrentSettings();
        const scenario = await createScenario(connection);
        scenarios.push(scenario);

        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const [currentActive] = await select<{ id: number }>(connection, "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1");
        if (currentActive) {
            await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE id = ?", [currentActive.id]);
        }
        await connection.execute("UPDATE schoolyear SET isActive = 1 WHERE id = ?", [scenario.schoolYearId]);

        await expect(updateAcademicSettingsService({ currentQuarter: numQuarters + 1 })).rejects.toBeInstanceOf(BadRequestError);
    });
});
