import FacultyModel from "../model/faculties.js";
import UserModel from "../model/users.js";

import { getDBPoolConnection } from "../config/database.js";

// Types constant
import { FACULTY_ROLES, isFacultyRole, loginRoleForFacultyRole } from "../constant/faculties.js";
import type { FacultyProps, FacultyRole, FacultyUpdateProps } from "../constant/faculties.js";
import { ConflictError, ForbiddenError, NotFoundError, BadRequestError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

// Service functions for managing faculties
import { createUserService, updateUserByUserIdService } from "./users.js";

// The school-year completion gate for role changes (plan §7).
import { assertSchoolYearAllowsRoleChange } from "./schoolYear.js";


// Helper function to get environment variables
import getEnv from "../helper/getEnv.js";

import { ROLES, type UserRoles } from "../constant/users.js";

// Create a new faculty service
// `faculty.role` is required and drives the login role: both faculty kinds
// (teacher and register) get users.role='teacher'; the teacher/register
// distinction lives only on faculties.role (plan §3 decision 3).
export async function CreateFacultyService(faculty: Omit<FacultyProps, "userId">) {
    if (!isFacultyRole(faculty.role)) {
        throw new BadRequestError(`"role" must be one of: teacher, register`);
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const facultyModel = new FacultyModel(connection);

        const newFacultyUser = {
            email: faculty.email,
            password: getEnv("DEFAULT_PASSWORD"),
            role: loginRoleForFacultyRole(faculty.role)
        };

        const newUserId = await createUserService(newFacultyUser, connection);

        if (!newUserId) {
            throw new Error("Failed to create user for faculty");
        }

        const facultyId = await facultyModel.createFaculty({...faculty, userId: newUserId});

        await connection.commit();

        return facultyId;
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

// Get all faculties service. `role` narrows the list to one faculty role —
// the assignment pickers request role=teacher so a register faculty member can
// never be offered a teaching duty (plan §6.2).
export async function getAllFacultiesService(role?: FacultyRole) {
    if (role !== undefined && !isFacultyRole(role)) {
        throw new BadRequestError(`"role" must be one of: teacher, register`);
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const facultyModel = new FacultyModel(connection);
        const faculties = await facultyModel.getAllFaculties(role);
        return faculties;
    }finally {
        connection.release();
    }
}

// Delete faculty by ID service
// Removes the faculty record and their linked login account together.
export async function deleteFacultyService(facultyId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const facultyModel = new FacultyModel(connection);
        const existing = await facultyModel.getFacultyById(facultyId);

        if(!existing) {
            throw new NotFoundError(`Faculty with ID ${facultyId} not found`, 404);
        }

        const adviserAssignments = await facultyModel.getClassFacultyAssignmentCount(facultyId);
        if (adviserAssignments > 0) {
            throw new ConflictError("Faculty is assigned as a class adviser and cannot be deleted. Reassign the class first.");
        }

        await facultyModel.deleteFaculty(facultyId);

        const userModel = new UserModel(connection);
        await userModel.deleteUserById(existing.userId);

        await connection.commit();
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

// Get faculty by user ID service
export async function getFacultyByUserIdService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyByUserId(userId);

        if(!faculty) {
            throw new NotFoundError(`Faculty account not found for user ${userId}`, 404);
        }

        return faculty;
    }finally {
        connection.release();
    }
}

// Get faculty by ID service
export async function getFacultyByIdService(facultyId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyById(facultyId);

        if(!faculty) {
            throw new NotFoundError(`Faculty with ID ${facultyId} not found`, 404);
        }

        return faculty;
    }finally {
        connection.release();
    }
}

// Update faculty by ID service
// Keeps the linked user account email in sync so faculty login keeps working.
//
// A role change is a SEPARATE, gated operation (plan §6-§7):
//   * admin actor only,
//   * only while the governing school year is officially 'completed' (409),
//   * teacher -> register must leave no live teaching duty behind (409 for the
//     adviser / class-subject links; subject eligibility is cleared here),
//   * users.role follows the faculty role so login and permissions stay in sync.
// Unrelated profile edits are untouched by any of that.
export async function updateFacultyService(
    facultyId: number,
    faculty: FacultyUpdateProps,
    actorRole?: UserRoles,
) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const facultyModel = new FacultyModel(connection);
        const existing = await facultyModel.getFacultyById(facultyId);

        if(!existing) {
            throw new NotFoundError(`Faculty with ID ${facultyId} not found`, 404);
        }

        const roleChanged = faculty.role !== undefined && faculty.role !== existing.role;

        if (roleChanged) {
            if (!isFacultyRole(faculty.role)) {
                throw new BadRequestError(`"role" must be one of: teacher, register`);
            }
            if (actorRole !== ROLES.ADMIN) {
                throw new ForbiddenError("Only an administrator can change a faculty role");
            }

            // Locking read of the school year, inside THIS transaction.
            await assertSchoolYearAllowsRoleChange(connection);

            if (faculty.role === FACULTY_ROLES.REGISTER && existing.role === FACULTY_ROLES.TEACHER) {
                const adviserAssignments = await facultyModel.getClassFacultyAssignmentCount(facultyId);
                if (adviserAssignments > 0) {
                    throw new ConflictError(
                        "This faculty member is a class adviser. Reassign the class before changing the role to register."
                    );
                }
                const teachingAssignments = await facultyModel.getClassSubjectAssignmentCount(facultyId);
                if (teachingAssignments > 0) {
                    throw new ConflictError(
                        "This faculty member is still assigned to class subjects. Unassign them before changing the role to register."
                    );
                }
                // Teaching eligibility is a capability, not a record: drop it in
                // the same transaction. Historical/frozen grades are snapshots
                // and stay exactly as they are.
                await facultyModel.clearSubjectAssignments(facultyId);
            }

            // Login/permission role must follow the faculty role.
            const userModel = new UserModel(connection);
            await userModel.updateUserRole(existing.userId, loginRoleForFacultyRole(faculty.role));
        }

        await facultyModel.updateFaculty(facultyId, faculty);

        if (faculty.email && existing.email !== faculty.email) {
            // System-driven sync (admin context): no current-password check needed.
            await updateUserByUserIdService(existing.userId, { email: faculty.email }, false, connection);
        }

        await connection.commit();
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

/**
 * Backend guard for every endpoint that assigns teaching work (plan §6.2).
 * Rejects any target that is not teaching faculty with 409, so a stale dropdown,
 * a cached list or a hand-crafted request cannot put a register faculty member
 * in front of a classroom. Always call it with the service's own connection so
 * the check and the write are one unit of work.
 */
export async function assertOnlyTeachingFaculty(
    connection: PoolConnection,
    facultyIds: number | number[],
): Promise<void> {
    const ids = (Array.isArray(facultyIds) ? facultyIds : [facultyIds]).filter(
        (id) => Number.isFinite(id) && id > 0
    );
    if (ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM faculties WHERE role <> 'teacher' AND id IN (${placeholders})`,
        ids,
    );
    const blocked = rows.map((row) => Number(row.id));

    if (blocked.length > 0) {
        throw new ConflictError(
            `Faculty member(s) ${blocked.join(", ")} hold the register role and cannot be assigned teaching responsibilities.`
        );
    }

    // An id that does not exist at all is just as wrong — no assignment to a
    // record that is not there.
    const [found] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM faculties WHERE id IN (${placeholders})`,
        ids,
    );
    if (found.length !== ids.length) {
        const known = new Set(found.map((row) => Number(row.id)));
        const missing = ids.filter((id) => !known.has(id));
        throw new NotFoundError(`Faculty member(s) ${missing.join(", ")} not found`, 404);
    }
}

export async function getFacultiesBySubjectIdService(subjectId: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection; 
    try {
        const facultyModel = new FacultyModel(connection);
        const faculties = await facultyModel.getFacultiesBySubjectId(subjectId);
        return faculties;
    }finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

// Get faculty subject details by faculties ID service
export async function getFacultySubjectDetailsFacultyByIdService(facultyId: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const facultyModel = new FacultyModel(connection);
        const facultyDetails = await facultyModel.getFacultySubjectDetailsFacultyByIdService(facultyId);
        return facultyDetails;
    }finally {
        if (ownConnection) {
            connection.release();
        }
    }
}