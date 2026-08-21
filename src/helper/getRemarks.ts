export function getRemarks(score: number) {
    const PASSING_GRADE = 75;
    
    return score >= PASSING_GRADE ? "Passed" : "Failed"
}