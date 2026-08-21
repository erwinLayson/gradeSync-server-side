interface CalculateFinalGrade {
    q1: string | null,
    q2: string | null,
    q3: string | null,
    q4: string | null,
}

export function calculateFinalGrade(quarters: CalculateFinalGrade): number | null {
    const grades = [quarters.q1, quarters.q2, quarters.q3, quarters.q4]
                    .filter((grade): grade is string => grade !== null).map((grade) => Number(grade));

    const total = grades.reduce((sum, grade) => (sum + grade), 0);
    const finalGrade = Number((total / grades.length).toFixed(2));

    return finalGrade;
}


