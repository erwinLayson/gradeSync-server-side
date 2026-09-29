import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import TeacherModel from "../model/teachers.js";
import { ForbiddenError, NotFoundError } from "../middleware/errors.js";
import { ROLES, type UserRoles } from "../constant/users.js";

/*
 * Single source of truth for ownership authorization.
 *
 * The role middleware only proves the caller HOLDS a role — it cannot prove the
 * caller may touch a specific row. These helpers close the horizontal-privilege
 * gap on the class-subject-scoped endpoints (gradebook, assessments, attendance,
 * grading weights) and on the student report card, using the existing
 * teachers / class_subjects / class_teacher / enrollments relationships.
 *
 * Convention (mirrors assertAdviserOfClass in service/studentRecord.ts):
 * `teacherId === null` means the caller is a privileged account (admin or
 * developer) and skips ownership — the route's role middleware has already
 * gated the endpoint. For a teacher, `teacherId` is the caller's teachers.id.
 */

// Resolve the acting account to a teachers.id. Returns null for admin/developer
// (privileged accounts have no teacher record) and throws 403 for any other
// role. A teacher-role account with no teacher record owns nothing, so it is
// refused too — "teacher record missing" must never be treated as privileged.
export async function resolveActorTeacherId(actor: { id: number; role: UserRoles }): Promise<number | null> {
    if (actor.role === ROLES.ADMIN || actor.role === ROLES.DEVELOPER) {
        return null;
    }
    if (actor.role !== ROLES.TEACHER) {
        throw new ForbiddenError("You are not allowed to access this resource");
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const teacherModel = new TeacherModel(connection);
        const teacher = await teacherModel.getTeacherByUserId(actor.id);
        if (!teacher) {
            throw new ForbiddenError("No teacher profile is linked to this account");
        }
        return teacher.id;
    } finally {
        connection.release();
    }
}

// Assert the acting teacher is the teacher assigned to this class_subject.
// 404 when the class subject does not exist; 403 when it belongs to another teacher.
export async function assertTeacherOwnsClassSubject(
    teacherId: number | null,
    classSubjectId: number,
    existingConnection?: PoolConnection,
): Promise<void> {
    if (teacherId === null) {
        return;
    }

    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT teacherId FROM class_subjects WHERE id = ? LIMIT 1",
            [classSubjectId],
        );
        const row = rows[0];
        if (!row) {
            throw new NotFoundError(`Class subject ${classSubjectId} not found`, 404);
        }
        if (Number(row.teacherId) !== teacherId) {
            throw new ForbiddenError("You are not assigned to this class subject");
        }
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

// Resolve an assessment to its class_subject and apply the ownership rule,
// so the assessment endpoints share the exact same policy as the gradebook.
export async function assertTeacherOwnsAssessment(
    teacherId: number | null,
    assessmentId: number,
): Promise<void> {
    if (teacherId === null) {
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
        await assertTeacherOwnsClassSubject(teacherId, Number(row.classSubjectId), connection);
    } finally {
        connection.release();
    }
}

// Assert the actor may read a student's report card for this enrollment.
//   - admin / developer: any student record (privileged).
//   - teacher: only the adviser of the class the enrollment belongs to — the
//     application's existing report-card rule (see TeacherReport.tsx).
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

    const teacherId = await resolveActorTeacherId(actor);

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
            "SELECT teacherId FROM class_teacher WHERE classId = ? LIMIT 1",
            [classId],
        );
        const adviserRow = adviserRows[0];
        const adviserId = adviserRow ? Number(adviserRow.teacherId) : null;
        if (adviserId === null || adviserId !== teacherId) {
            throw new ForbiddenError("You are not the class adviser for this student");
        }
    } finally {
        connection.release();
    }
}
