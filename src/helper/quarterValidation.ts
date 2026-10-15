/** The largest number of grading periods the system supports. */
export const MAX_QUARTERS = 4;

/** The smallest number of grading periods the system supports. */
export const MIN_QUARTERS = 3;

/** Quarter-transition classification for a PATCH /academic-settings request. */
export type QuarterTransition = "same" | "advance" | "skip" | "rewind";

/**
 * Validates that a quarter number is within the allowed range for the school's
 * configured number of grading periods.
 */
export function isValidQuarter(quarter: number, numQuarters: number): boolean {
    return Number.isInteger(quarter) && quarter >= 1 && quarter <= numQuarters;
}

/**
 * Parses a raw request value into a whole quarter number.
 *
 * Returns null for anything that is not a whole number or a string of digits —
 * deliberately rejecting booleans, null, arrays, objects, fractions, and
 * non-numeric strings. `Number()` alone is not used for the decision because it
 * coerces `true` → 1 and `""` → 0, which would silently accept nonsense as a
 * valid quarter.
 */
export function parseQuarterInput(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isInteger(value) ? value : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
    }
    return null;
}

/**
 * Classifies a requested quarter against the stored one.
 *
 * Only "advance" (exactly one quarter forward) is a legitimate progress action.
 * "skip" jumps over a quarter, "same" is an idempotent no-op, and "rewind" is a
 * deliberate administrative correction (see updateAcademicSettingsService).
 */
export function classifyQuarterTransition(current: number, requested: number): QuarterTransition {
    if (requested === current) return "same";
    if (requested === current + 1) return "advance";
    return requested > current ? "skip" : "rewind";
}

/** Returns an array of valid quarter numbers, e.g. [1, 2, 3] or [1, 2, 3, 4]. */
export function getQuarterArray(numQuarters: number): number[] {
    return Array.from({ length: numQuarters }, (_, i) => i + 1);
}
