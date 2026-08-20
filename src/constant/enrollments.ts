export type EnrollmentStatus = "enrolled" | "unenrolled" | "dropped" | "completed";

export interface EnrollmentCreateProps {
    studentId: number;
    classId: number;
    schoolYearId: number;
    subjectIds: number[];
}

export interface EnrollmentResponseProps {
    id: number;
    dateEnrolled: string;
    classId: number;
    schoolYearId: number;
    studentId: number;
    status: EnrollmentStatus;
}
