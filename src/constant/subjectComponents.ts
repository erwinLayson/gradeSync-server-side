// Types for subject sub-components (e.g., MAPEH → Music, Arts, PE, Health)
// See docs/subject-sub-components.md for the full design.

// ---------------- stored rows ----------------

export interface SubjectComponent {
    id: number;
    parentSubjectId: number;
    name: string;
    code: string;
    weight: number;
    createdAt: Date | string;
}

// ---------------- API input types ----------------

export interface ComponentCreateProps {
    name: string;
    code: string;
    weight: number;
}

export interface ComponentUpdateProps {
    name?: string;
    code?: string;
    weight?: number;
}

// ---------------- API response types ----------------

export interface SubjectWithComponents {
    id: number;
    name: string;
    code: string;
    unit: number;
    hasComponents: boolean;
    components: SubjectComponent[];
}

// ---------------- Grade computation types ----------------

export interface ComponentGrade {
    componentId: number;
    componentName: string;
    componentCode: string;
    weight: number;
    grade: number | null;
}

// For frozen records
export interface StudentAcademicRecordComponentRow {
    id: number;
    subjectRowId: number;
    componentId: number;
    componentName: string;
    componentCode: string;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    q4: number | null;
}
