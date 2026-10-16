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



// Server-side controls for the student registry list (GET /students). The
// registry is paginated/filtered/sorted in SQL so the client never downloads
// the whole roll; see docs/student-management-ui-plan.md.
export type StudentListSort = "name" | "lrn" | "email" | "id";
export type StudentListDir = "asc" | "desc";
/** "active" hides soft-deleted learners; "inactive" shows only them; "all" shows both. */
export type StudentListStatus = "active" | "inactive" | "all";

export interface StudentListQuery {
    search?: string | undefined;
    status: StudentListStatus;
    /** Restrict to students with an active enrollment in this classroom. */
    classId?: number | undefined;
    page: number;
    pageSize: number;
    sort: StudentListSort;
    dir: StudentListDir;
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