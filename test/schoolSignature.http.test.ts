import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import type { PoolConnection } from "mysql2/promise";

import SchoolInfoRoutes from "../src/routes/schoolInfo.js";
import ErrorHandler from "../src/middleware/errorHandler.js";
import getEnv from "../src/helper/getEnv.js";
import { getTestConnection, select } from "./helpers/db.js";

/**
 * HTTP-level regression test for POST /api/school-info/signature.
 *
 * The save failure this guards against was an axios bug on the client: a shared
 * `Content-Type: application/json` made axios serialize the FormData body to a
 * JSON string, so the multipart file never reached multer and the controller saw
 * no `req.file`. The fix is client-side, but the contract the client must honour
 * lives here — so this suite mounts the REAL school-info router (multer upload
 * middleware and auth included) and posts a browser-style multipart request,
 * asserting the bytes are received and persisted.
 *
 * The full app is intentionally not imported: a minimal Express app keeps the
 * test focused on this router (and avoids pulling in the PDF/puppeteer chain).
 */

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api", SchoolInfoRoutes);
app.use(ErrorHandler);

// Minimal valid 1x1 PNG (passes the magic-byte sniffer).
const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
);

function tokenFor(role: "admin" | "teacher", id = 1): string {
    return jwt.sign({ id, email: `${role}@test.local`, role }, getEnv("JWT_SECRET"));
}

interface SignatureResponse {
    success: boolean;
    data?: {
        signature: { mimeType: string; byteSize: number; updatedAt: string | null; dataUrl: string } | null;
    };
}

describe("POST /api/school-info/signature (HTTP multipart contract)", () => {
    let server: Server;
    let baseUrl: string;
    let connection: PoolConnection;

    beforeAll(async () => {
        connection = await getTestConnection();
        await connection.execute("DELETE FROM school_signature");

        server = await new Promise<Server>((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/api`;
    });

    afterAll(async () => {
        await connection.execute("DELETE FROM school_signature");
        connection.release();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function postSignature(blob: Blob | null, token: string | null = tokenFor("admin")): Promise<Response> {
        const form = new FormData();
        if (blob) form.append("image", blob, "signature.png");

        const headers: Record<string, string> = {};
        if (token) headers.Cookie = `login_token=${token}`;

        return fetch(`${baseUrl}/school-info/signature`, { method: "POST", body: form, headers });
    }

    async function rowCount(): Promise<number> {
        const rows = await select<{ cnt: number }>(connection, "SELECT COUNT(*) AS cnt FROM school_signature");
        return Number(rows[0]?.cnt ?? 0);
    }

    it("persists a PNG uploaded under the 'image' field and echoes it back", async () => {
        await connection.execute("DELETE FROM school_signature");

        const res = await postSignature(new Blob([PNG_1x1], { type: "image/png" }));
        expect(res.status).toBe(200);

        const body = (await res.json()) as SignatureResponse;
        expect(body.success).toBe(true);
        expect(body.data?.signature?.mimeType).toBe("image/png");
        expect(body.data?.signature?.byteSize).toBe(PNG_1x1.length);
        expect(body.data?.signature?.dataUrl).toBe(`data:image/png;base64,${PNG_1x1.toString("base64")}`);
        expect(await rowCount()).toBe(1);
    });

    it("returns the saved signature from GET (readable by any authenticated role)", async () => {
        const res = await fetch(`${baseUrl}/school-info/signature`, {
            headers: { Cookie: `login_token=${tokenFor("teacher")}` },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as SignatureResponse;
        expect(body.data?.signature?.dataUrl).toContain("base64,");
    });

    it("rejects a multipart request with no file — the original 400", async () => {
        const res = await postSignature(null);
        expect(res.status).toBe(400);
    });

    it("rejects an unauthenticated upload", async () => {
        const res = await postSignature(new Blob([PNG_1x1], { type: "image/png" }), null);
        expect(res.status).toBe(401);
    });

    it("rejects a non-admin upload", async () => {
        const res = await postSignature(new Blob([PNG_1x1], { type: "image/png" }), tokenFor("teacher"));
        expect(res.status).toBe(403);
    });

    it("rejects a file that is not an image", async () => {
        const res = await postSignature(new Blob([Buffer.from("definitely not an image")], { type: "text/plain" }));
        expect(res.status).toBe(400);
    });

    it("rejects an oversized upload", async () => {
        const oversized = Buffer.concat([PNG_1x1, Buffer.alloc(1024 * 1024)]);
        const res = await postSignature(new Blob([oversized], { type: "image/png" }));
        expect(res.status).toBe(400);
    });

    it("keeps the existing signature when a replacement fails", async () => {
        await connection.execute("DELETE FROM school_signature");
        expect((await postSignature(new Blob([PNG_1x1], { type: "image/png" }))).status).toBe(200);

        const before = await select<{ byteSize: number }>(connection, "SELECT byteSize FROM school_signature LIMIT 1");

        const bad = await postSignature(new Blob([Buffer.from("bad")], { type: "text/plain" }));
        expect(bad.status).toBe(400);

        const after = await select<{ byteSize: number }>(connection, "SELECT byteSize FROM school_signature LIMIT 1");
        expect(Number(after[0]?.byteSize)).toBe(Number(before[0]?.byteSize));
    });
});
