export interface StudentCreateProps {
    userId?: number;
    lrn: number,
    email: string,
    firstname: string,
    middlename: string,
    lastname: string,
    suffix?: string | null,
    birthdate: string,
    sex: string,
    status?: "active" | "inactive"
}

export interface StudentResponseProps {
    id: number,
    userId?: number,
    lrn: number,
    email: string,
    firstname?: string,
    middlename?: string,
    lastname?: string,
    suffix?: string | null,
    fullname: string,
    birthdate: string,
    age: number
    sex: string,
    status?: "active" | "inactive" | null,
    created_at: string,
    updated_at: string
}

export interface StudentWithClassroom {
    enrollmentId: number;
    studentId: number;
    studentLrn: number;
    studentEmail: string;
    fullname: string;
    studentBirthdate: string;
    studentAge: number;
    studentSex: string;
}



export const AllowedStudentFields = [
    "lrn",
    "email",
    "firstname",
    "middlename",
    "lastname",
    "suffix",
    "birthdate",
    "sex",
    "status"
];