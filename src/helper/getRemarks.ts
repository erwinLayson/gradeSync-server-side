// The passing mark for every subject / quarter / final grade in the system.
// Single definition — every remarks and pass/fail decision should use isPassing
// or getRemarks instead of comparing against 75 directly.
export const PASSING_GRADE = 75;

export function isPassing(score: number): boolean {
    return score >= PASSING_GRADE;
}

export function getRemarks(score: number): "Passed" | "Failed" {
    return isPassing(score) ? "Passed" : "Failed";
}