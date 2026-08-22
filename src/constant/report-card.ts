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

/** One sub-component row (e.g., Music under MAPEH). */
export interface ComponentGradeRow {
    componentName: string,
    q1: number | null,
    q2: number | null,
    q3: number | null,
    q4: number | null,
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
    remarks: string,
    /** Sub-component grades (e.g., Music, Arts, PE, Health under MAPEH). */
    components?: ComponentGradeRow[] | undefined,
}
