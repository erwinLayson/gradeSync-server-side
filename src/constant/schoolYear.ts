// The authoritative completion marker (docs/faculty-role-implementation-plan.md §7).
// `isActive` means "this is the current year", NOT "the year is finished" —
// `status` is the only thing that permits a faculty role change.
export type SchoolYearStatus = "ongoing" | "completed";

export const SCHOOL_YEAR_STATUSES: readonly SchoolYearStatus[] = ["ongoing", "completed"];

export function isSchoolYearStatus(value: unknown): value is SchoolYearStatus {
  return typeof value === "string" && (SCHOOL_YEAR_STATUSES as readonly string[]).includes(value);
}

export interface SchoolYear {
  id: number,
  startYear: string,
  endYear: string,
  // 1 = the current/active school year (exactly one row is active).
  isActive?: boolean
  // 'ongoing' until the year is officially completed; 'completed' once marked.
  status?: SchoolYearStatus
}
