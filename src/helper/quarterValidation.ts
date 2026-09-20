/**
 * Validates that a quarter number is within the allowed range for the school's
 * configured number of grading periods.
 */
export function isValidQuarter(quarter: number, numQuarters: number): boolean {
    return Number.isInteger(quarter) && quarter >= 1 && quarter <= numQuarters;
}

/** Returns an array of valid quarter numbers, e.g. [1, 2, 3] or [1, 2, 3, 4]. */
export function getQuarterArray(numQuarters: number): number[] {
    return Array.from({ length: numQuarters }, (_, i) => i + 1);
}
