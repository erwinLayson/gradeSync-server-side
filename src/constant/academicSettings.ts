// Single-row system settings: the current quarter and whether enrollment is open.
export interface AcademicSettingsProps {
    id: number;
    currentQuarter: number;
    enrollmentOpen: boolean;
}

// Fields an admin is allowed to edit on the academic settings record.
export const AllowedAcademicSettingFields = ["currentQuarter", "enrollmentOpen"] as const;

// Payload accepted by PATCH /api/academic-settings.
export type AcademicSettingsUpdateProps = Partial<{
    currentQuarter: number;
    enrollmentOpen: number;
}>;
