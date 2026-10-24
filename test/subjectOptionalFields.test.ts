import { afterEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { CreateSubjectController } from "../src/controller/subjects.js";
import { getTestConnection, select } from "./helpers/db.js";

/**
 * Subject creation with the optional fields omitted.
 *
 * Units are optional (subjects without credit units) and sub-components are
 * optional (only composite subjects like MAPEH have them). Name and code stay
 * required.
 */

const createdIds: number[] = [];

type MockResponse = Response & { statusCode: number; body: unknown };

async function createSubject(body: Record<string, unknown>) {
    const request = { body } as unknown as Request;
    const response = {
        statusCode: 0,
        body: null,
        status(code: number) {
            response.statusCode = code;
            return response;
        },
        json(payload: unknown) {
            response.body = payload;
            return response;
        },
    } as unknown as MockResponse;

    let nextError: unknown;
    const next = ((error?: unknown) => {
        nextError = error;
    }) as NextFunction;

    await CreateSubjectController(request, response, next);

    if (nextError) throw nextError;
    return response;
}

afterEach(async () => {
    const connection = await getTestConnection();
    try {
        for (const id of createdIds.splice(0)) {
            await connection.execute("DELETE FROM subject_components WHERE parentSubjectId = ?", [id]);
            await connection.execute("DELETE FROM subjects WHERE id = ?", [id]);
        }
    } finally {
        connection.release();
    }
});

describe("subject creation with optional fields", () => {
    it("creates a subject with no unit and no sub-components", async () => {
        const code = `OPT-${Date.now().toString(36)}`;
        const response = await createSubject({
            name: "Optional Unit",
            code,
            // unit omitted, hasComponents/components omitted
        });

        expect(response.statusCode).toBe(201);

        const connection = await getTestConnection();
        try {
            const rows = await select<{ id: number; unit: number | null; hasComponents: number }>(
                connection,
                "SELECT id, unit, hasComponents FROM subjects WHERE code = ?",
                [code],
            );

            expect(rows).toHaveLength(1);
            createdIds.push(rows[0]!.id);
            expect(rows[0]!.unit).toBeNull();
            expect(rows[0]!.hasComponents).toBe(0);

            const components = await select<{ id: number }>(
                connection,
                "SELECT id FROM subject_components WHERE parentSubjectId = ?",
                [rows[0]!.id],
            );
            expect(components).toHaveLength(0);
        } finally {
            connection.release();
        }
    });

    it("still saves units and sub-components when supplied", async () => {
        const code = `OPT-${Date.now().toString(36)}-C`;
        const response = await createSubject({
            name: "Composite",
            code,
            unit: "3",
            hasComponents: true,
            components: [
                { name: "Music", code: "MUS", weight: 50 },
                { name: "Arts", code: "ART", weight: 50 },
            ],
        });

        expect(response.statusCode).toBe(201);

        const connection = await getTestConnection();
        try {
            const rows = await select<{ id: number; unit: number | null; hasComponents: number }>(
                connection,
                "SELECT id, unit, hasComponents FROM subjects WHERE code = ?",
                [code],
            );

            expect(rows).toHaveLength(1);
            createdIds.push(rows[0]!.id);
            expect(Number(rows[0]!.unit)).toBe(3);
            expect(rows[0]!.hasComponents).toBe(1);

            const components = await select<{ name: string; weight: number }>(
                connection,
                "SELECT name, weight FROM subject_components WHERE parentSubjectId = ? ORDER BY id",
                [rows[0]!.id],
            );
            expect(components.map((component) => component.name)).toEqual(["Music", "Arts"]);
        } finally {
            connection.release();
        }
    });
});
