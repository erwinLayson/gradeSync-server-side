export interface ClassroomResponse {
    id: number;
    section: string;
    gradeLevel: number;
    totalStudent?: number;
    adviserId?: number | null;
    adviserFullname?: string | null;
    // 'active' | 'inactive' (archived classes are hidden from lists).
    status?: string;
}

export interface ClassroomFacultiesWithSubjectProps  {
    classSubjectId: number;
    facultyId: number;
    unit: number,
    code: string;
    facultyFullname: string;
    subjectId: number;
    subjectName: string;
}

export interface NewClassroomSubject {
    classId: number;
    subjectId: number;
    facultyId: number;
}
