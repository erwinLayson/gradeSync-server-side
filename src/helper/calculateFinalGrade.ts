interface CalculateFinalGrade {
    q1: string | null,
    q2: string | null,
    q3: string | null,
    q4: string | null,
}

export function calculateFinalGrade(quarters: CalculateFinalGrade): number | null {
    const grades = [quarters.q1, quarters.q2, quarters.q3, quarters.q4]
                    .filter((grade): grade is string => grade !== null)
                    .map((grade) => Number(grade))
                    .filter((grade) => !Number.isNaN(grade));

    if (grades.length === 0) {
        return null;
    }

    const total = grades.reduce((sum, grade) => sum + grade, 0);
    return Math.round((total / grades.length) * 100) / 100;
}
