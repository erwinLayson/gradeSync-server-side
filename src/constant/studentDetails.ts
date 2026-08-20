// 1:1 additional student info, filled in by the student themselves after login.
// Admin-managed fields (lrn, names, birthdate, sex, ...) live on `students`.
export interface StudentDetailsProps {
    id: number;
    studentId: number;
    birthplace: string | null;
    permanentAddress: string | null;
    religion: string | null;
    contactNumber: string | null;
    guardianName: string | null;
    guardianRelation: string | null;
    guardianContact: string | null;
    guardianOccupation: string | null;
    created_at?: string;
    updated_at?: string | null;
}

// Payload accepted by PATCH /students/details (student self-service).
export type StudentDetailsUpdateProps = Partial<{
    birthplace: string;
    permanentAddress: string;
    religion: string;
    contactNumber: string;
    guardianName: string;
    guardianRelation: string;
    guardianContact: string;
    guardianOccupation: string;
}>;

export const AllowedStudentDetailsFields = [
    "birthplace",
    "permanentAddress",
    "religion",
    "contactNumber",
    "guardianName",
    "guardianRelation",
    "guardianContact",
    "guardianOccupation"
] as const;

// Dropdown options for the Guardian Relation field on the student profile form.
export const GUARDIAN_RELATIONS = ["Mother", "Father", "Guardian", "Other"] as const;
