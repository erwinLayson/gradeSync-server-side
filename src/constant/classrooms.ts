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

export interface ClassroomTeachersWithSubjectProps  {
    teacherId: number;
    unit: number,
    code: string;
    teacherFullname: string;
    subjectId: number;
    subjectName: string;
}

export interface NewClassroomSubject {
    classId: number;
    subjectId: number;
    teacherId: number;
}
