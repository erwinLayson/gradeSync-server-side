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
 * HTTP-level regression tests for POST /api/school-info/logo.
 *
 * Mounts the REAL school-info router (multer upload middleware and auth
 * included) and posts browser-style multipart requests, asserting the bytes are
 * received, persisted, and readable by authenticated roles.
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

interface LogoResponse {
    success: boolean;
    data?: {
        logo: { mimeType: string; byteSize: number; updatedAt: string | null; dataUrl: string } | null;
    };
}

describe("POST /api/school-info/logo (HTTP multipart contract)", () => {
    let server: Server;
    let baseUrl: string;
    let connection: PoolConnection;

    beforeAll(async () => {
        connection = await getTestConnection();
        await connection.execute("DELETE FROM school_logo");

        server = await new Promise<Server>((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/api`;
    });

    afterAll(async () => {
        await connection.execute("DELETE FROM school_logo");
        connection.release();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function postLogo(blob: Blob | null, token: string | null = tokenFor("admin")): Promise<Response> {
        const form = new FormData();
        if (blob) form.append("image", blob, "logo.png");

        const headers: Record<string, string> = {};
        if (token) headers.Cookie = `login_token=${token}`;

        return fetch(`${baseUrl}/school-info/logo`, { method: "POST", body: form, headers });
    }

    async function rowCount(): Promise<number> {
        const rows = await select<{ cnt: number }>(connection, "SELECT COUNT(*) AS cnt FROM school_logo");
        return Number(rows[0]?.cnt ?? 0);
    }

    it("persists a PNG uploaded under the 'image' field and echoes it back", async () => {
        await connection.execute("DELETE FROM school_logo");

        const res = await postLogo(new Blob([PNG_1x1], { type: "image/png" }));
        expect(res.status).toBe(200);

        const body = (await res.json()) as LogoResponse;
        expect(body.success).toBe(true);
        expect(body.data?.logo?.mimeType).toBe("image/png");
        expect(body.data?.logo?.byteSize).toBe(PNG_1x1.length);
        expect(body.data?.logo?.dataUrl).toBe(`data:image/png;base64,${PNG_1x1.toString("base64")}`);
        expect(await rowCount()).toBe(1);
    });

    it("returns the saved logo from GET (readable by any authenticated role)", async () => {
        const res = await fetch(`${baseUrl}/school-info/logo`, {
            headers: { Cookie: `login_token=${tokenFor("teacher")}` },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as LogoResponse;
        expect(body.data?.logo?.dataUrl).toContain("base64,");
    });

    it("serves the saved logo publicly for the login and landing pages", async () => {
        const res = await fetch(`${baseUrl}/school-info/logo`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as LogoResponse;
        expect(body.data?.logo?.dataUrl).toContain("base64,");
    });

    it("rejects a multipart request with no file", async () => {
        const res = await postLogo(null);
        expect(res.status).toBe(400);
    });

    it("rejects an unauthenticated upload", async () => {
        const res = await postLogo(new Blob([PNG_1x1], { type: "image/png" }), null);
        expect(res.status).toBe(401);
    });

    it("rejects a non-admin upload", async () => {
        const res = await postLogo(new Blob([PNG_1x1], { type: "image/png" }), tokenFor("teacher"));
        expect(res.status).toBe(403);
    });

    it("rejects a file that is not an image", async () => {
        const res = await postLogo(new Blob([Buffer.from("definitely not an image")], { type: "text/plain" }));
        expect(res.status).toBe(400);
    });
});
