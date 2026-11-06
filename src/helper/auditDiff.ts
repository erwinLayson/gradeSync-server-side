/**
 * Computes a key-by-key difference between an object's before and after states.
 * Preserves numbers, strings, nulls, and booleans for the audit log.
 */
export function computeAuditDiff<T extends Record<string, any>>(
    before: T | null | undefined,
    after: T | null | undefined
): Record<string, { old: any; new: any }> {
    const diff: Record<string, { old: any; new: any }> = {};
    const beforeObj = before ?? ({} as T);
    const afterObj = after ?? ({} as T);

    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    for (const key of allKeys) {
        const oldVal = (beforeObj as any)[key];
        const newVal = (afterObj as any)[key];
        if (oldVal !== newVal) {
            diff[key] = { old: oldVal ?? null, new: newVal ?? null };
        }
    }
    return diff;
}

