export interface StudentScoreProps {
    id: number;
    assessmentId: number;
    // Scores are tied to an enrollment (not a bare student) so a score can only
    // ever belong to a student who is actually enrolled in the assessment's class.
    enrollmentId: number;
    score: number;
}

// One entry of a batch score-sheet save: one student's (via enrollment) raw
// score for one assessment.
export interface StudentScoreInput {
    enrollmentId: number;
    score: number;
}

export interface StudentAttendanceProps {
    // Attendance is tied to an enrollment (not a bare student), so a record can
    // only ever belong to a student who is actually enrolled in the class, and
    // school-year ambiguity is impossible (enrollments carry schoolYearId).
    enrollmentId: number;
    presentDays: number;
    totalDays: number;
}

export type AttendanceStatus = "present" | "absent";

// One raw attendance row for a class on a specific date.
export interface AttendanceRecord {
    enrollmentId: number;
    status: AttendanceStatus | null;
    date?: string;
    // Which quarter (1-4) this record belongs to. Set by the teacher in the
    // UI when the day's attendance is saved (the same way assessments carry an
    // explicit quarter). Null on rows created before the quarter column existed.
    quarter?: number | null;
}

// One entry of a daily attendance save: one student's (via enrollment) status
// for a specific date. Mirrors StudentScoreInput for the score sheet. The
// quarter is a day-level attribute sent alongside the entries (see
// saveAttendanceController), not per student.
export interface AttendanceInput {
    enrollmentId: number;
    status: AttendanceStatus;
}

export interface GradeWeights {
    writtenWorkWeight: number;
    performanceTaskWeight: number;
    quarterlyAssessmentWeight: number;
    attendanceWeight: number;
}

// DepEd DO 8 s. 2015 default component weights (SHS profile), used when a class
// subject has no row in the grading_weights table. Weights are percentages and
// sum to 100. attendanceWeight is 0 by default (opt-in): the teacher enables it
// per class subject by setting a weight in the grading_weights table
// (see src/seed.ts for an example).
export const DEFAULT_GRADING_WEIGHTS: GradeWeights = {
    writtenWorkWeight: 20,
    performanceTaskWeight: 60,
    quarterlyAssessmentWeight: 20,
    attendanceWeight: 0,
};