export interface Subject {
    id: number;
    name: string;
    code : string;
    unit: number 
}

export interface AssignTeacherProps {
    subjectId: number,
    teachersId: number[],
}

export interface SubjectWithTeachersNotAssignedToClass {
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    subjectUnit: number;
    teacherId: number;
    teacherFullname: string;
}
