import { LRUCache } from "lru-cache";

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 60_000;

function positiveNumberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") {
        return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Process-wide LRU cache. Used both by the HTTP response-cache middleware and
// by services that want to memoise an expensive query. Entries are bounded by
// count and expire after the default TTL so a missed invalidation can never
// serve stale data forever.
// LRUCache requires V extends {}, so the value type is the broad `{}` and
// getOrSet re-casts to the caller's type.
export const cache = new LRUCache<string, {}>({
    max: positiveNumberFromEnv("CACHE_MAX_ENTRIES", DEFAULT_MAX_ENTRIES),
    ttl: positiveNumberFromEnv("CACHE_TTL_MS", DEFAULT_TTL_MS),
});

export function buildCacheKey(...parts: Array<string | number | undefined>): string {
    return parts.filter((part) => part !== undefined).join(":");
}

// Read-through helper: returns a cached value when present, otherwise runs the
// fetcher, stores the result and returns it. `undefined` results are not cached.
export async function getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number,
): Promise<T> {
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached as unknown as T;
    }

    const value = await fetcher();
    if (value !== undefined) {
        cache.set(key, value as unknown as {}, ttlMs === undefined ? {} : { ttl: ttlMs });
    }
    return value;
}

export function invalidate(key: string): boolean {
    return cache.delete(key);
}

export function invalidateByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix) && cache.delete(key)) {
            removed += 1;
        }
    }
    return removed;
}

export function invalidateAll(): void {
    cache.clear();
}

export function cacheStats(): { size: number; max: number; ttlMs: number } {
    return {
        size: cache.size,
        max: cache.max,
        ttlMs: positiveNumberFromEnv("CACHE_TTL_MS", DEFAULT_TTL_MS),
    };
}
