// Single-row system settings: the current quarter, enrollment status, and
// whether teachers are blocked from submitting quarterly student records.
export interface AcademicSettingsProps {
    id: number;
    currentQuarter: number;
    numQuarters: number;
    enrollmentOpen: boolean;
    submissionsLocked: boolean;
}

// Fields an admin is allowed to edit on the academic settings record.
export const AllowedAcademicSettingFields = ["currentQuarter", "numQuarters", "enrollmentOpen", "submissionsLocked"] as const;

// Payload accepted by PATCH /api/academic-settings.
export type AcademicSettingsUpdateProps = Partial<{
    currentQuarter: number;
    numQuarters: number;
    enrollmentOpen: number;
    submissionsLocked: number;
}>;
