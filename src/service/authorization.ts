import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import FacultyModel from "../model/faculties.js";
import { ForbiddenError, NotFoundError } from "../middleware/errors.js";
import { ROLES, type UserRoles } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

/*
 * Single source of truth for ownership authorization.
 *
 * The role middleware only proves the caller HOLDS a role — it cannot prove the
 * caller may touch a specific row. These helpers close the horizontal-privilege
 * gap on the class-subject-scoped endpoints (gradebook, assessments, attendance,
 * grading weights) and on the student report card, using the existing
 * faculties / class_subjects / class_adviser / enrollments relationships.
 *
 * Convention (mirrors assertAdviserOfClass in service/studentRecord.ts):
 * `facultyId === null` means the caller is a privileged account (admin or
 * developer) and skips ownership — the route's role middleware has already
 * gated the endpoint. For a faculty, `facultyId` is the caller's faculties.id.
 */

// Resolve the acting account to a faculties.id. Returns null for admin/developer
// (privileged accounts have no faculty record) and throws 403 for any other
// role. A faculty-role account with no faculty record owns nothing, so it is
// refused too — "faculty record missing" must never be treated as privileged.
export async function resolveActorFacultyId(actor: { id: number; role: UserRoles }): Promise<number | null> {
    if (actor.role === ROLES.ADMIN || actor.role === ROLES.DEVELOPER) {
        return null;
    }
    if (actor.role !== ROLES.TEACHER) {
        throw new ForbiddenError("You are not allowed to access this resource");
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyByUserId(actor.id);
        if (!faculty) {
            throw new ForbiddenError("No faculty profile is linked to this account");
        }
        // Belt and braces: a register faculty member must never act through a
        // teaching endpoint. The backend is the boundary, not the UI.
        if (faculty.role !== FACULTY_ROLES.TEACHER) {
            throw new ForbiddenError("This account holds the register role and cannot perform teaching actions");
        }
        return faculty.id;
    } finally {
        connection.release();
    }
}

/**
 * Resolve the teaching faculty record for a teaching-capability endpoint.
 *
 * This is the server-side authority for "may this signed-in user do teaching work".
 * It does not trust `users.role` alone: a faculty account authenticates as
 * `users.role = "teacher"`, and the actual capability comes from `faculties.role`.
 *
 * - Admin/developer callers are privileged and skip ownership (return null).
 * - Any other caller is refused (403).
 * - A teacher-role account without a faculty record is refused (403).
 * - A teacher-role account whose faculty role is not `teacher` is refused (403).
 *
 * Returns null for privileged callers, or the verified `faculties.id` for a
 * teaching faculty member.
 */
export async function resolveTeachingFacultyId(
    actor: { id: number; role: UserRoles },
    existingConnection?: PoolConnection,
): Promise<number | null> {
    if (actor.role === ROLES.ADMIN || actor.role === ROLES.DEVELOPER) {
        return null;
    }
    if (actor.role !== ROLES.TEACHER) {
        throw new ForbiddenError("You are not allowed to access this resource");
    }

    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyByUserId(actor.id);
        if (!faculty) {
            throw new ForbiddenError("No faculty profile is linked to this account");
        }
        if (faculty.role !== FACULTY_ROLES.TEACHER) {
            throw new ForbiddenError("This account holds the register role and cannot perform teaching actions");
        }
        return faculty.id;
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

/**
 * Resolve the registration-faculty record for a register-staff endpoint.
 *
 * Registration work is a faculty capability, so it is authorized here via the
 * authenticated user's verified faculty record, not via `users.role`.
 *
 * - Admin callers are privileged and skip ownership (return null).
 * - Any other caller is refused (403) unless they are a faculty account with a
 *   verified `faculties.role === "register"`.
 * - A faculty account with no linked faculty record is refused (403).
 *
 * Returns null for privileged callers, or the verified `faculties.id` for the
 * register faculty member.
 */
export async function resolveRegisterFacultyId(
    actor: { id: number; role: UserRoles },
    existingConnection?: PoolConnection,
): Promise<number | null> {
    if (actor.role === ROLES.ADMIN) {
        return null;
    }

    if (actor.role !== ROLES.TEACHER) {
        throw new ForbiddenError("Only faculty accounts may access this resource");
    }

    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyByUserId(actor.id);

        if (!faculty) {
            throw new ForbiddenError("No faculty profile is linked to this account");
        }
        if (faculty.role !== FACULTY_ROLES.REGISTER) {
            throw new ForbiddenError("This account does not hold the register role");
        }
        return faculty.id;
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

// Assert the acting faculty is the faculty assigned to this class_subject.
// 404 when the class subject does not exist; 403 when it belongs to another faculty.
export async function assertFacultyOwnsClassSubject(
    facultyId: number | null,
    classSubjectId: number,
    existingConnection?: PoolConnection,
): Promise<void> {
    if (facultyId === null) {
        return;
    }

    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT facultyId FROM class_subjects WHERE id = ? LIMIT 1",
            [classSubjectId],
        );
        const row = rows[0];
        if (!row) {
            throw new NotFoundError(`Class subject ${classSubjectId} not found`, 404);
        }
        if (Number(row.facultyId) !== facultyId) {
            throw new ForbiddenError("You are not assigned to this class subject");
        }
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

// Assert the actor may READ a class subject's gradebook.
//
// This is deliberately looser than assertFacultyOwnsClassSubject (which guards
// every mutation): a class ADVISER may read the gradebook of any subject in the
// class they advise, because the adviser's My Class > Graded view summarises the
// whole class across all subjects — and the same figures are already exposed to
// advisers through the class-records endpoint (assertAdviserOfClass).
//   - admin / developer: any class subject (privileged).
//   - faculty: the subject's assigned faculty, or the adviser of its class.
// Writes are unaffected: they still go through assertFacultyOwnsClassSubject /
// assertFacultyOwnsAssessment, so an adviser who does not teach the subject can
// read its grades but never record or change them.
export async function assertFacultyCanReadClassSubject(
    facultyId: number | null,
    classSubjectId: number,
): Promise<void> {
    if (facultyId === null) {
        return;
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT facultyId, classId FROM class_subjects WHERE id = ? LIMIT 1",
            [classSubjectId],
        );
        const row = rows[0];
        if (!row) {
            throw new NotFoundError(`Class subject ${classSubjectId} not found`, 404);
        }
        if (Number(row.facultyId) === facultyId) {
            return;
        }

        const [adviserRows] = await connection.execute<RowDataPacket[]>(
            "SELECT facultyId FROM class_adviser WHERE classId = ? LIMIT 1",
            [Number(row.classId)],
        );
        const adviserRow = adviserRows[0];
        if (adviserRow && Number(adviserRow.facultyId) === facultyId) {
            return;
        }

        throw new ForbiddenError("You are not assigned to this class subject");
    } finally {
        connection.release();
    }
}

// Resolve an assessment to its class_subject and apply the ownership rule,
// so the assessment endpoints share the exact same policy as the gradebook.
export async function assertFacultyOwnsAssessment(
    facultyId: number | null,
    assessmentId: number,
): Promise<void> {
    if (facultyId === null) {
        return;
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT classSubjectId FROM assessments WHERE id = ? LIMIT 1",
            [assessmentId],
        );
        const row = rows[0];
        if (!row) {
            throw new NotFoundError(`Assessment with ID ${assessmentId} not found`, 404);
        }
        await assertFacultyOwnsClassSubject(facultyId, Number(row.classSubjectId), connection);
    } finally {
        connection.release();
    }
}

/**
 * Assert the caller is a teaching faculty member for a teaching-capability endpoint.
 *
 * This is used by endpoints that must reject register faculty even though the
 * route's role guard may allow any faculty account. It reuses the same resolver
 * as the other teaching endpoints so the decision is centralised.
 */
export async function assertCallerIsTeachingFaculty(
    actor: { id: number; role: UserRoles },
    existingConnection?: PoolConnection,
): Promise<void> {
    await resolveTeachingFacultyId(actor, existingConnection);
}

// Assert the actor may read a student's report card for this enrollment.
//   - admin / developer: any student record (privileged).
//   - faculty: only the adviser of the class the enrollment belongs to — the
//     application's existing report-card rule (see FacultyReport.tsx).
//   - any other role: refused.
export async function assertCanAccessEnrollment(
    actor: { id: number; role: UserRoles },
    enrollmentId: number,
): Promise<void> {
    if (actor.role === ROLES.ADMIN || actor.role === ROLES.DEVELOPER) {
        return;
    }
    if (actor.role !== ROLES.TEACHER) {
        throw new ForbiddenError("You are not allowed to access this student record");
    }

    const facultyId = await resolveTeachingFacultyId(actor);

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const [enrollmentRows] = await connection.execute<RowDataPacket[]>(
            "SELECT classId FROM enrollments WHERE id = ? LIMIT 1",
            [enrollmentId],
        );
        const enrollmentRow = enrollmentRows[0];
        if (!enrollmentRow) {
            throw new NotFoundError(`Enrollment ${enrollmentId} not found`, 404);
        }
        const classId = Number(enrollmentRow.classId);

        const [adviserRows] = await connection.execute<RowDataPacket[]>(
            "SELECT facultyId FROM class_adviser WHERE classId = ? LIMIT 1",
            [classId],
        );
        const adviserRow = adviserRows[0];
        const adviserId = adviserRow ? Number(adviserRow.facultyId) : null;
        if (adviserId === null || adviserId !== facultyId) {
            throw new ForbiddenError("You are not the class adviser for this student");
        }
    } finally {
        connection.release();
    }
}
