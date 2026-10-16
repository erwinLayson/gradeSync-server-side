import { ROLES, type UserRoles } from "./users.js";

// The faculty record replaces the old "teacher" record: one row per teaching OR
// registration staff member, carrying WHICH kind it is.
// docs/faculty-role-implementation-plan.md §1-§5.
//
// NOTE this is a FACULTY-level role and is now the ONLY place the teacher vs.
// register distinction lives. `register` is no longer a users.role value: every
// faculty account (either kind) authenticates as users.role = "teacher", and
// the authoritative capability comes from this faculties.role column, resolved
// server-side from the signed-in user's own faculty record
// (middleware/allowedFacultyRoles.ts).
export const FACULTY_ROLES = {
    TEACHER: "teacher",
    REGISTER: "register",
} as const;

export type FacultyRole = (typeof FACULTY_ROLES)[keyof typeof FACULTY_ROLES];

export const FACULTY_ROLE_VALUES: readonly FacultyRole[] = Object.values(FACULTY_ROLES);

/** True when `value` is one of the two supported faculty roles. */
export function isFacultyRole(value: unknown): value is FacultyRole {
    return typeof value === "string" && (FACULTY_ROLE_VALUES as readonly string[]).includes(value);
}

/**
 * The users.role a faculty member authenticates with.
 *
 * `register` is no longer a user-level role, so BOTH faculty roles share the
 * single faculty account role "teacher": users.role says "this is a faculty
 * account", faculties.role says which kind of faculty it is. Callers must not
 * derive capabilities from this value alone — the faculty-role guard does that.
 */
export function loginRoleForFacultyRole(_role: FacultyRole): UserRoles {
    return ROLES.TEACHER;
}

export interface FacultyProps {
    userId: number,
    email: string,
    firstname: string,
    middlename: string,
    lastname: string,
    suffix?: string,
    // Required: every faculty row must declare teacher | register.
    role: FacultyRole,
}

export interface FacultyWithId extends FacultyProps {
    id: number,
}

export interface FacultyResponse {
    id: number,
    userId: number,
    email: string,
    fullname: string,
    role: FacultyRole,
}

export interface FacultyDetails extends FacultyResponse {
    firstname: string,
    middlename: string,
    lastname: string,
    suffix?: string | null,
}

export interface FacultyUpdateProps {
    email?: string,
    firstname?: string,
    middlename?: string,
    lastname?: string,
    suffix?: string | null,
    // Optional so unrelated profile edits keep working during an active school
    // year - but when present it MUST be valid, and CHANGING it is gated by the
    // school-year completion rule (service/faculties.ts).
    role?: FacultyRole,
}


export interface FacultySubjectDetails {
    classSubjectId: number,
    subjectId: number,
    subjectName: string,
    subjectCode: string,
    subjectUnit: number;
    classGradeLevel: number,
    classId: number,
    classSection: string
}