import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { getTestConnection } from "./helpers/db.js";
import {
    getActiveSchoolYearService,
    activateSchoolYearService,
    recoverActiveSchoolYearService
} from "../src/service/schoolYear.js";
import { BadRequestError, NotFoundError } from "../src/middleware/errors.js";

describe("School Year Activation Invariant and Safety Tests", () => {
    let connection: PoolConnection;
    let baselineActiveId: number | null = null;
    const disposableYearIds: number[] = [];

    beforeAll(async () => {
        connection = await getTestConnection();
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1"
        );
        baselineActiveId = (rows[0] as { id: number } | undefined)?.id ?? null;
        if (!baselineActiveId) {
            const [allYears] = await connection.execute<RowDataPacket[]>("SELECT id FROM schoolyear LIMIT 1");
            if (allYears.length > 0) {
                baselineActiveId = Number(allYears[0]?.id);
                await connection.execute("UPDATE schoolyear SET isActive = (id = ?)", [baselineActiveId]);
            } else {
                baselineActiveId = await createDisposableYear(2026, true);
            }
        }
    });

    afterAll(async () => {
        // Clean up disposable years created during the tests
        if (disposableYearIds.length > 0) {
            await connection.execute(
                `DELETE FROM schoolyear WHERE id IN (${disposableYearIds.join(",")})`
            );
        }

        // Restore baseline active school year
        if (baselineActiveId !== null) {
            await connection.execute("UPDATE schoolyear SET isActive = (id = ?)", [baselineActiveId]);
        }
        connection.release();
    });

    async function createDisposableYear(startYear: number, isActive = false, status = "ongoing"): Promise<number> {
        const [res] = await connection.execute<ResultSetHeader>(
            "INSERT INTO schoolyear (startYear, endYear, isActive, status) VALUES (?, ?, ?, ?)",
            [String(startYear), String(startYear + 1), isActive ? 1 : 0, status]
        );
        disposableYearIds.push(res.insertId);
        return res.insertId;
    }

    it("retrieves the active school year via getActiveSchoolYearService", async () => {
        const active = await getActiveSchoolYearService();
        expect(active).not.toBeNull();
        expect(Number(active?.isActive)).toBe(1);
    });

    it("switches the active school year atomically and deactivates others", async () => {
        const testYearA = await createDisposableYear(2080, false);
        const testYearB = await createDisposableYear(2081, false);

        // Activate testYearA
        await activateSchoolYearService(testYearA);
        const activeAfterA = await getActiveSchoolYearService();
        expect(activeAfterA?.id).toBe(testYearA);

        // Activate testYearB -> testYearA should be deactivated
        await activateSchoolYearService(testYearB);
        const activeAfterB = await getActiveSchoolYearService();
        expect(activeAfterB?.id).toBe(testYearB);

        // Verify in DB that testYearA has isActive = 0
        const [rowsA] = await connection.execute<RowDataPacket[]>(
            "SELECT isActive FROM schoolyear WHERE id = ?",
            [testYearA]
        );
        expect(Number(rowsA[0]?.isActive)).toBe(0);
    });

    it("enforces database-level constraint uq_single_active_schoolyear on duplicate active insert", async () => {
        const testYearA = await createDisposableYear(2085, false);
        await activateSchoolYearService(testYearA);

        // Direct raw insert attempting second active year
        await expect(
            connection.execute(
                "INSERT INTO schoolyear (startYear, endYear, isActive, status) VALUES ('2086', '2087', 1, 'ongoing')"
            )
        ).rejects.toMatchObject({
            code: "ER_DUP_ENTRY"
        });
    });

    it("refuses to activate a completed school year", async () => {
        const completedYear = await createDisposableYear(2088, false, "completed");

        await expect(
            activateSchoolYearService(completedYear)
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("throws NotFoundError when activating a non-existent school year ID", async () => {
        await expect(
            activateSchoolYearService(9999999)
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("recovers an active school year when all school years are inactive", async () => {
        const recoveryYear = await createDisposableYear(2090, false, "ongoing");

        // Temporarily clear active flag
        await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");

        const recovered = await recoverActiveSchoolYearService();
        expect(recovered).not.toBeNull();
        expect(Boolean(recovered.isActive)).toBe(true);

        const activeAfterRecovery = await getActiveSchoolYearService();
        expect(activeAfterRecovery).not.toBeNull();
    });
});
