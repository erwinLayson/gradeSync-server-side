interface CalculateFinalGrade {
    q1: string | null,
    q2: string | null,
    q3: string | null,
    q4: string | null,
}

// Averages the recorded quarters up to numQuarters (default 4). Quarters beyond
// the school's configured grading periods are ignored so legacy Q4 data stays
// out of the final grade when the school switches to 3 quarters.
export function calculateFinalGrade(quarters: CalculateFinalGrade, numQuarters: number = 4): number | null {
    const columns: (keyof CalculateFinalGrade)[] = (["q1", "q2", "q3", "q4"] as const)
        .slice(0, Math.max(1, Math.min(4, numQuarters)));
    const grades = columns
                    .map((column) => quarters[column])
                    .filter((grade): grade is string => grade !== null)
                    .map((grade) => Number(grade))
                    .filter((grade) => !Number.isNaN(grade));

    if (grades.length === 0) {
        return null;
    }

    const total = grades.reduce((sum, grade) => sum + grade, 0);
    return Math.round((total / grades.length) * 100) / 100;
}
