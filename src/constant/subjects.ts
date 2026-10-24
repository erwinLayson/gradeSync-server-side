export interface Subject {
    id: number;
    name: string;
    code : string;
    unit: number | null;
    hasComponents?: boolean;
}

export interface AssignFacultyProps {
    subjectId: number,
    facultiesId: number[],
}

export interface SubjectWithFacultiesNotAssignedToClass {
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    subjectUnit: number;
    facultyId: number;
    facultyFullname: string;
}
