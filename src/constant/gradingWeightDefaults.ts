// The single-row default grading weights used by class subjects that have no
// row in the grading_weights table (per-class-subject weights override these).
export interface GradingWeightDefaultsProps {
    id: number;
    writtenWorkWeight: number;
    performanceTaskWeight: number;
    quarterlyAssessmentWeight: number;
    attendanceWeight: number;
}

// Fields an admin is allowed to edit on the defaults record.
export const AllowedGradingWeightDefaultFields = [
    "writtenWorkWeight",
    "performanceTaskWeight",
    "quarterlyAssessmentWeight",
    "attendanceWeight"
] as const;

// Payload accepted by PATCH /api/grading-weight-defaults.
export type GradingWeightDefaultsUpdateProps = Partial<{
    writtenWorkWeight: number;
    performanceTaskWeight: number;
    quarterlyAssessmentWeight: number;
    attendanceWeight: number;
}>;
