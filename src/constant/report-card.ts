export interface ReportCard {
    studentFullName: string,
    studentAge: number,
    sex: "Male" | "Female",
    studentLrn: string,
    schoolYear: string,
    classSection: string,
    classGradeLevel: number,
    classAdviser: string
}

export interface StudentQaurterlyGrades {
    subjectName: string,
    q1: number,
    q2: number,
    q3: number,
    q4: number
}

export interface Subjects {
    name: string,
    quarters: {
        q1: number
        q2: number
        q3: number
        q4: number
    }
    finalGrades: number | null,
}
