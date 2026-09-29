/**
 * Attendance present rate as a percentage (0-100, clamped, 2 decimals), or null
 * when there are no school days to divide by.
 *
 * This is the DISPLAYED attendance rate. The grade formula in
 * service/gradebook.ts (computeQuarterGrade) deliberately uses the unclamped
 * present/total ratio as its attendance percentage — do not swap that call for
 * this helper.
 */
export function computeAttendanceRate(presentDays: number, totalDays: number): number | null {
    if (totalDays <= 0) {
        return null;
    }
    // Clamp at 100 in case bad data ever records more presents than total days.
    return Math.min(100, Math.round((presentDays / totalDays) * 10000) / 100);
}
