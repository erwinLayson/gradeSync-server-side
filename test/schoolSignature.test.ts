import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PoolConnection } from "mysql2/promise";

import { getTestConnection, select } from "./helpers/db.js";

import { getSchoolSignatureService, saveSchoolSignatureService } from "../src/service/schoolSignature.js";
import { BadRequestError } from "../src/middleware/errors.js";
import { MAX_SIGNATURE_BYTES } from "../src/constant/schoolSignature.js";

/**
 * Service-level contract tests for GET/POST /api/school-info/signature.
 *
 * The signature is validated and persisted by the service (the controller just
 * forwards the multer buffer), so exercising the service directly covers the
 * endpoint contract without an HTTP harness — same approach as the other tests.
 */

// Minimal valid 1x1 PNG — passes the magic-byte sniffer.
const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
);

describe("school signature service", () => {
    let connection: PoolConnection;

    beforeAll(async () => {
        connection = await getTestConnection();
        await connection.execute("DELETE FROM school_signature");
    });

    afterAll(async () => {
        await connection.execute("DELETE FROM school_signature");
        connection.release();
    });

    it("returns null before any signature has been saved", async () => {
        await connection.execute("DELETE FROM school_signature");
        await expect(getSchoolSignatureService()).resolves.toBeNull();
    });

    it("stores the bytes and returns a renderable data URL", async () => {
        await connection.execute("DELETE FROM school_signature");

        const saved = await saveSchoolSignatureService({ buffer: PNG_1x1 }, null);
        expect(saved.mimeType).toBe("image/png");
        expect(saved.byteSize).toBe(PNG_1x1.length);
        expect(typeof saved.updatedAt).toBe("string");
        expect(saved.dataUrl).toBe(`data:image/png;base64,${PNG_1x1.toString("base64")}`);

        const fetched = await getSchoolSignatureService();
        expect(fetched?.dataUrl).toBe(saved.dataUrl);
    });

    it("keeps a single row and returns the latest signature when replaced", async () => {
        await connection.execute("DELETE FROM school_signature");
        await saveSchoolSignatureService({ buffer: PNG_1x1 }, null);

        // A longer but still PNG-signed buffer, so it replaces the first.
        const replacement = Buffer.concat([PNG_1x1, Buffer.from([0x00])]);
        const saved = await saveSchoolSignatureService({ buffer: replacement }, 1);
        expect(saved.byteSize).toBe(replacement.length);
        expect(saved.dataUrl).toContain(replacement.toString("base64"));

        const rows = await select<{ cnt: number }>(connection, "SELECT COUNT(*) AS cnt FROM school_signature");
        expect(Number(rows[0]?.cnt ?? 0)).toBe(1);
    });

    it("rejects an empty upload", async () => {
        await expect(saveSchoolSignatureService({ buffer: Buffer.alloc(0) }, null)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects bytes that are not a whitelisted image", async () => {
        await expect(
            saveSchoolSignatureService({ buffer: Buffer.from("<svg>not an image</svg>") }, null),
        ).rejects.toThrow(/valid PNG, JPEG or WebP/);
    });

    it("rejects a signature larger than the size cap", async () => {
        const oversized = Buffer.concat([PNG_1x1, Buffer.alloc(MAX_SIGNATURE_BYTES)]);
        await expect(saveSchoolSignatureService({ buffer: oversized }, null)).rejects.toBeInstanceOf(BadRequestError);
    });
});
