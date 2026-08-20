export interface TeacherProps {
    userId: number,
    email: string,
    firstname: string,
    middlename: string,
    lastname: string,
    suffix?: string,
}

export interface TeacherWithId extends TeacherProps {
    id: number,
}

export interface TeacherResponse {
    id: number,
    userId: number,
    email: string,
    fullname: string,
}

export interface TeacherDetails extends TeacherResponse {
    firstname: string,
    middlename: string,
    lastname: string,
    suffix?: string | null,
}

export interface TeacherUpdateProps {
    email?: string,
    firstname?: string,
    middlename?: string,
    lastname?: string,
    suffix?: string | null,
}


export interface TeacherSubjectDetails {
    classSubjectId: number,
    subjectId: number,
    subjectName: string,
    subjectCode: string,
    subjectUnit: number;
    classGradeLevel: number,
    classId: number,
    classSection: string
}