import type { Request, RequestHandler, Response } from "express";

import { cache, invalidateAll } from "../helper/cache.js";

interface CachedResponse {
    statusCode: number;
    body: unknown;
}

export interface CacheResponseOptions {
    // Overrides the cache-wide TTL for this route (milliseconds).
    ttl?: number;
    // Set to true for responses that do not depend on the caller (e.g. public
    // landing content). Defaults to false so authenticated responses are keyed
    // per user and never leak between accounts.
    shared?: boolean;
}

function responseKey(req: Request, shared: boolean): string {
    // The key includes the full URL (path + query). When the response is not
    // shared, the caller identity and role are mixed in as well.
    if (shared) {
        return `http:GET:${req.originalUrl}:shared`;
    }

    const user = req.user;
    const identity = user
        ? `${user.id}:${user.role}:${user.facultyRole ?? ""}`
        : "anonymous";

    return `http:GET:${req.originalUrl}:${identity}`;
}

// Caches successful JSON responses for GET routes. Mount it AFTER auth
// middleware so `req.user` is available for the per-user cache key.
// The `any` params type keeps the handler assignable to the typed
// RequestHandler<{...}> arrays used by the route modules.
export function cacheResponse(options: CacheResponseOptions = {}): RequestHandler<any> {
    return (req, res, next) => {
        if (req.method !== "GET") {
            next();
            return;
        }

        const shared = options.shared === true;
        const key = responseKey(req, shared);
        const cached = cache.get(key) as CachedResponse | undefined;

        if (cached !== undefined) {
            res.setHeader("X-Cache", "HIT");
            res.status(cached.statusCode).json(cached.body);
            return;
        }

        const originalJson = res.json.bind(res);
        res.json = ((body: unknown) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(
                    key,
                    { statusCode: res.statusCode, body } satisfies CachedResponse,
                    options.ttl === undefined ? {} : { ttl: options.ttl },
                );
            }
            res.setHeader("X-Cache", "MISS");
            return originalJson(body);
        }) as Response["json"];

        next();
    };
}

// Clears the response cache whenever the request mutates server state. This is
// deliberately coarse (one write invalidates every cached read) — it keeps the
// cache correct without each controller having to know which keys to drop.
export function invalidateCacheOnWrite(): RequestHandler {
    return (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
            // Drop entries from before the write, then drop again once it
            // finishes so a concurrent GET cannot leave a stale entry behind.
            invalidateAll();
            res.once("finish", invalidateAll);
        }
        next();
    };
}
