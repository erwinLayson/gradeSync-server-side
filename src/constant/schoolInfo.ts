// The single school-info record (one row, seeded with the school's details).
export interface SchoolInfoProps {
    id: number;
    schoolId: number;
    name: string;
    district: string;
    division: string;
    region: string;
    principal: string | null;
    address: string | null;
}

// Fields an admin is allowed to edit on the school information record.
export const AllowedSchoolInfoFields = [
    "schoolId",
    "name",
    "district",
    "division",
    "region",
    "principal",
    "address"
] as const;

// Payload accepted by PATCH /api/school-info (any subset of the editable fields).
export type SchoolInfoUpdateProps = Partial<{
    schoolId: number;
    name: string;
    district: string;
    division: string;
    region: string;
    principal: string | null;
    address: string | null;
}>;
