import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";

import { cacheResponse, invalidateCacheOnWrite } from "../src/middleware/cache.js";
import { buildCacheKey, cache, getOrSet, invalidateAll, invalidateByPrefix } from "../src/helper/cache.js";
import { ROLES } from "../src/constant/users.js";

/**
 * Tests for the lru-cache based response cache.
 *
 * A minimal Express app mounts the real middleware against stub handlers, so
 * the assertions cover the actual cache keying, TTL and invalidation logic
 * without touching the database or any application service.
 */

let featureHits = 0;
let sharedHits = 0;
let failureHits = 0;
let shortHits = 0;

const app = express();
app.use(express.json());

// Stand-in for ValidateToken: identifies the caller from a header so the
// per-user cache key can be exercised without minting JWTs.
app.use((req, _res, next) => {
    const rawUserId = req.header("x-test-user");
    if (rawUserId) {
        req.user = {
            id: Number(rawUserId),
            email: `${rawUserId}@test.local`,
            role: ROLES.ADMIN,
        };
    }
    next();
});

app.use(invalidateCacheOnWrite());

app.get("/features", cacheResponse({ ttl: 60_000 }), (_req, res) => {
    featureHits += 1;
    res.status(200).json({ hits: featureHits });
});

app.get("/features/shared", cacheResponse({ ttl: 60_000, shared: true }), (_req, res) => {
    sharedHits += 1;
    res.status(200).json({ hits: sharedHits });
});

app.get("/features/fails", cacheResponse({ ttl: 60_000 }), (_req, res) => {
    failureHits += 1;
    res.status(500).json({ hits: failureHits });
});

app.get("/features/short", cacheResponse({ ttl: 20 }), (_req, res) => {
    shortHits += 1;
    res.status(200).json({ hits: shortHits });
});

app.post("/features", (_req, res) => {
    res.status(201).json({ ok: true });
});

describe("cacheResponse middleware", () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = await new Promise<Server>((resolve) => {
            const listening = app.listen(0, () => resolve(listening));
        });
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
        invalidateAll();
        featureHits = 0;
        sharedHits = 0;
        failureHits = 0;
        shortHits = 0;
    });

    function get(path: string, userId = 1): Promise<Response> {
        return fetch(`${baseUrl}${path}`, {
            headers: { "x-test-user": String(userId) },
        });
    }

    it("serves the second identical GET from the cache", async () => {
        const first = await get("/features");
        expect(first.status).toBe(200);
        expect(first.headers.get("x-cache")).toBe("MISS");
        const firstBody = await first.json();

        const second = await get("/features");
        expect(second.headers.get("x-cache")).toBe("HIT");
        expect(await second.json()).toEqual(firstBody);
        expect(featureHits).toBe(1);
    });

    it("keys entries by query string", async () => {
        const first = await get("/features?tab=1");
        expect(first.headers.get("x-cache")).toBe("MISS");

        const second = await get("/features?tab=2");
        expect(second.headers.get("x-cache")).toBe("MISS");

        expect(featureHits).toBe(2);
    });

    it("does not share non-shared entries across users", async () => {
        const first = await get("/features", 1);
        expect(first.headers.get("x-cache")).toBe("MISS");

        const second = await get("/features", 2);
        expect(second.headers.get("x-cache")).toBe("MISS");

        expect(featureHits).toBe(2);
    });

    it("serves shared entries to every caller", async () => {
        const first = await get("/features/shared", 1);
        expect(first.headers.get("x-cache")).toBe("MISS");

        const second = await get("/features/shared", 2);
        expect(second.headers.get("x-cache")).toBe("HIT");

        expect(sharedHits).toBe(1);
    });

    it("does not cache failed responses", async () => {
        const first = await get("/features/fails");
        expect(first.status).toBe(500);

        const second = await get("/features/fails");
        expect(second.status).toBe(500);
        expect(second.headers.get("x-cache")).toBe("MISS");

        expect(failureHits).toBe(2);
    });

    it("drops cached entries after a write", async () => {
        expect((await get("/features")).headers.get("x-cache")).toBe("MISS");
        expect((await get("/features")).headers.get("x-cache")).toBe("HIT");

        const write = await fetch(`${baseUrl}/features`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        expect(write.status).toBe(201);

        const afterWrite = await get("/features");
        expect(afterWrite.headers.get("x-cache")).toBe("MISS");
        expect(featureHits).toBe(2);
    });

    it("expires entries after their TTL", async () => {
        expect((await get("/features/short")).headers.get("x-cache")).toBe("MISS");
        await new Promise((resolve) => setTimeout(resolve, 80));

        const afterTtl = await get("/features/short");
        expect(afterTtl.headers.get("x-cache")).toBe("MISS");
        expect(shortHits).toBe(2);
    });
});

describe("cache helper", () => {
    beforeEach(() => {
        invalidateAll();
    });

    it("getOrSet only calls the fetcher once", async () => {
        let calls = 0;
        const first = await getOrSet("answer", async () => {
            calls += 1;
            return { value: 42 };
        });
        const second = await getOrSet("answer", async () => {
            calls += 1;
            return { value: 99 };
        });

        expect(first).toEqual({ value: 42 });
        expect(second).toEqual({ value: 42 });
        expect(calls).toBe(1);
    });

    it("does not cache undefined results", async () => {
        let calls = 0;
        const fetcher = async () => {
            calls += 1;
            return undefined;
        };

        await getOrSet("missing", fetcher);
        await getOrSet("missing", fetcher);

        expect(calls).toBe(2);
        expect(cache.has("missing")).toBe(false);
    });

    it("invalidates entries by prefix", () => {
        cache.set(buildCacheKey("http", "GET", "/features"), { ok: true });
        cache.set(buildCacheKey("http", "GET", "/subjects"), { ok: true });
        cache.set("service:other", { ok: true });

        expect(invalidateByPrefix("http:")).toBe(2);
        expect(cache.has("http:GET:/features")).toBe(false);
        expect(cache.has("http:GET:/subjects")).toBe(false);
        expect(cache.has("service:other")).toBe(true);
    });
});
