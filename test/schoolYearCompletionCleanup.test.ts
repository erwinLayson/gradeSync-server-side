import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection } from "mysql2/promise";

import { count, getTestConnection } from "./helpers/db.js";
import { createScenario, finalizeScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";
import { setSchoolYearStatusService } from "../src/service/schoolYear.js";
import { getNumQuarters } from "../src/service/academicSettings.js";
import { ConflictError } from "../src/middleware/errors.js";

describe("School Year Completion & Classroom Cleanup Integration", () => {
    let connection: PoolConnection;
    const scenarios: Scenario[] = [];
    let numQuarters = 4;

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

    it("rejects completing the school year when active enrollments have unfinalized grades", async () => {
        const scenario = await track();
        // scenario has an enrolled student with unfinalized quarter records

        await expect(
            setSchoolYearStatusService(scenario.schoolYearId, "completed")
        ).rejects.toBeInstanceOf(ConflictError);

        // Verification: status remains unchanged, data is NOT cleared
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM schoolyear WHERE id = ? AND status = 'completed'", [scenario.schoolYearId])
        ).toBe(0);
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'enrolled'", [scenario.enrollmentId])
        ).toBe(1);
    });

    it("successfully clears classroom rosters and marks enrollments completed when school year is completed", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        const result = await setSchoolYearStatusService(scenario.schoolYearId, "completed");

        expect(result.totalCleared).toBeGreaterThanOrEqual(1);
        expect(result.classroomsCleared).toBeGreaterThanOrEqual(1);

        // School year is marked completed
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM schoolyear WHERE id = ? AND status = 'completed'", [scenario.schoolYearId])
        ).toBe(1);

        // Enrollment is marked completed
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM enrollments WHERE id = ? AND status = 'completed'", [scenario.enrollmentId])
        ).toBe(1);

        // Operational classroom links and scores are removed
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM class_students WHERE enrollmentId = ?", [scenario.enrollmentId])
        ).toBe(0);
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM student_scores WHERE enrollmentId = ?", [scenario.enrollmentId])
        ).toBe(0);

        // Historical permanent records are preserved
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM student_academic_records WHERE enrollmentId = ?", [scenario.enrollmentId])
        ).toBe(1);
    });

    it("allows reopening a completed school year to ongoing", async () => {
        const scenario = await track();
        await finalizeScenario(connection, scenario, { quarters: numQuarters });

        await setSchoolYearStatusService(scenario.schoolYearId, "completed");
        const reopenResult = await setSchoolYearStatusService(scenario.schoolYearId, "ongoing");

        expect(reopenResult.totalCleared).toBe(0);
        expect(
            await count(connection, "SELECT COUNT(*) AS cnt FROM schoolyear WHERE id = ? AND status = 'ongoing'", [scenario.schoolYearId])
        ).toBe(1);
    });
});
