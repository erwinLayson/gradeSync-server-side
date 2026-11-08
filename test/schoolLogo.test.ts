import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, select } from "./helpers/db.js";

import { getSchoolLogoService, saveSchoolLogoService } from "../src/service/schoolLogo.js";
import { BadRequestError } from "../src/middleware/errors.js";
import { MAX_LOGO_BYTES } from "../src/constant/schoolLogo.js";

/**
 * Service-level contract tests for GET/POST /api/school-info/logo.
 *
 * The logo is validated and persisted directly in school_logo (the controller just
 * forwards the multer buffer), so exercising the service directly covers the
 * endpoint contract without an HTTP harness - same approach as the signature
 * tests.
 */

// Minimal valid 1x1 PNG - passes the magic-byte sniffer.
const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
);

describe("school logo service", () => {
    let connection: PoolConnection;

    beforeAll(async () => {
        connection = await getTestConnection();
        await connection.execute("DELETE FROM school_logo");
    });

    afterAll(async () => {
        await connection.execute("DELETE FROM school_logo");
        connection.release();
    });

    it("returns null before any logo has been saved", async () => {
        await connection.execute("DELETE FROM school_logo");
        await expect(getSchoolLogoService()).resolves.toBeNull();
    });

    it("stores the bytes and returns a renderable data URL", async () => {
        await connection.execute("DELETE FROM school_logo");

        const saved = await saveSchoolLogoService({ buffer: PNG_1x1 }, null);
        expect(saved.mimeType).toBe("image/png");
        expect(saved.byteSize).toBe(PNG_1x1.length);
        expect(typeof saved.updatedAt).toBe("string");
        expect(saved.dataUrl).toBe(`data:image/png;base64,${PNG_1x1.toString("base64")}`);

        const fetched = await getSchoolLogoService();
        expect(fetched?.dataUrl).toBe(saved.dataUrl);
    });

    it("stores a logo up to the maximum allowed size directly in school_logo", async () => {
        await connection.execute("DELETE FROM school_logo");

        // 512 KB logo stored directly in school_logo.image
        const mediumLogo = Buffer.concat([PNG_1x1, Buffer.alloc(512 * 1024, 0x01)]);
        const saved = await saveSchoolLogoService({ buffer: mediumLogo }, null);

        expect(saved.byteSize).toBe(mediumLogo.length);
        expect(saved.dataUrl).toBe(`data:image/png;base64,${mediumLogo.toString("base64")}`);

        const fetched = await getSchoolLogoService();
        expect(fetched?.byteSize).toBe(mediumLogo.length);
        expect(fetched?.dataUrl).toBe(saved.dataUrl);

        const rows = await select<{ cnt: number }>(
            connection,
            "SELECT COUNT(*) AS cnt FROM school_logo",
        );
        expect(Number(rows[0]?.cnt ?? 0)).toBe(1);
    });

    it("keeps a single row and returns the latest logo when replaced", async () => {
        await connection.execute("DELETE FROM school_logo");
        await saveSchoolLogoService({ buffer: PNG_1x1 }, null);

        // A longer but still PNG-signed buffer, so it replaces the first.
        const replacement = Buffer.concat([PNG_1x1, Buffer.from([0x00])]);
        const saved = await saveSchoolLogoService({ buffer: replacement }, 1);
        expect(saved.byteSize).toBe(replacement.length);
        expect(saved.dataUrl).toContain(replacement.toString("base64"));

        const rows = await select<{ cnt: number }>(connection, "SELECT COUNT(*) AS cnt FROM school_logo");
        expect(Number(rows[0]?.cnt ?? 0)).toBe(1);
    });

    it("rejects an empty upload", async () => {
        await expect(saveSchoolLogoService({ buffer: Buffer.alloc(0) }, null)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects bytes that are not a whitelisted image", async () => {
        await expect(
            saveSchoolLogoService({ buffer: Buffer.from("<svg>not an image</svg>") }, null),
        ).rejects.toThrow(/valid PNG, JPEG or WebP/);
    });

    it("rejects a logo larger than the size cap", async () => {
        const oversized = Buffer.concat([PNG_1x1, Buffer.alloc(MAX_LOGO_BYTES)]);
        await expect(saveSchoolLogoService({ buffer: oversized }, null)).rejects.toBeInstanceOf(BadRequestError);
    });
});
