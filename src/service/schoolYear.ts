import { getDBPoolConnection } from "../config/database.js";

import SchoolYearModel from "../model/schoolYear.js";
import { BadRequestError, ConflictError, NotFoundError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";
import type { SchoolYear, SchoolYearStatus } from "../constant/schoolYear.js";
import { invalidateByPrefix } from "../helper/cache.js";
import { clearAllClassroomsService } from "./enrollments.js";

export async function getSchoolYearService(): Promise<SchoolYear[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        return await SYModel.getSchoolYear();
    } finally {
        connection.release();
    }
}

export async function getActiveSchoolYearService(): Promise<SchoolYear | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        return await SYModel.getActiveSchoolYear(false);
    } finally {
        connection.release();
    }
}

// Create a new school year for the current academic period
export async function createSchoolYearService(): Promise<SchoolYear> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const SYModel = new SchoolYearModel(connection);
        const startYear = new Date().getFullYear();
        const endYear = startYear + 1;

        const existing = await SYModel.getSchoolYearByStartYear(startYear);
        if (existing) {
            throw new ConflictError(`School year ${startYear} - ${endYear} already exists`);
        }

        // Rule 2: If there are 0 existing school years or no active year exists,
        // automatically activate the newly created school year.
        const totalYears = await SYModel.countSchoolYears();
        const currentActive = await SYModel.getActiveSchoolYear(true);
        const shouldBeActive = totalYears === 0 || currentActive === null;

        const id = await SYModel.createSchoolYear(startYear, endYear, shouldBeActive);
        await connection.commit();

        invalidateByPrefix("http:GET:/schoolYear");

        return {
            id,
            startYear: String(startYear),
            endYear: String(endYear),
            isActive: shouldBeActive,
            status: "ongoing"
        };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Make `id` the single active school year. Returns the refreshed list.
export async function activateSchoolYearService(id: number): Promise<SchoolYear[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const SYModel = new SchoolYearModel(connection);
        const existing = await SYModel.getSchoolYearById(id);
        if (!existing) {
            throw new NotFoundError(`School year with ID ${id} not found`, 404);
        }

        if (existing.status === "completed") {
            throw new BadRequestError("Cannot activate a completed school year. Reopen the school year first.");
        }

        await SYModel.activateSchoolYear(id);
        await connection.commit();

        invalidateByPrefix("http:GET:/schoolYear");

        return await SYModel.getSchoolYear();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Explicit administrative recovery: activate the newest ongoing (or newest) school year
export async function recoverActiveSchoolYearService(): Promise<SchoolYear> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const SYModel = new SchoolYearModel(connection);

        const currentActive = await SYModel.getActiveSchoolYear(true);
        if (currentActive) {
            await connection.rollback();
            return currentActive;
        }

        const allYears = await SYModel.getSchoolYear();
        if (allYears.length === 0) {
            throw new NotFoundError("No school years exist to activate.", 404);
        }

        const target = allYears.find((y) => y.status === "ongoing") ?? allYears[0]!;
        await SYModel.activateSchoolYear(target.id);
        await connection.commit();

        invalidateByPrefix("http:GET:/schoolYear");

        return { ...target, isActive: true };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * Gate for every faculty-role change (docs/faculty-role-implementation-plan.md §7).
 *
 * MUST be called inside the transaction that performs the role change: it reads
 * the governing school year FOR UPDATE, so the completion check and the write
 * cannot be separated by a concurrent "complete year" / "activate next year".
 *
 * The ONLY completion signal is schoolyear.status. `isActive` answers "which
 * year is current", not "is it finished", and dates never decide it. A missing,
 * unknown or still-ongoing status means the change is refused (409).
 */
export async function assertSchoolYearAllowsRoleChange(connection: PoolConnection): Promise<void> {
    const SYModel = new SchoolYearModel(connection);
    const year = await SYModel.getCurrentSchoolYearForUpdate();

    if (!year) {
        throw new ConflictError(
            "Faculty roles cannot be changed: no school year could be verified. " +
            "Create a school year and mark it completed first."
        );
    }

    if (year.status !== "completed") {
        throw new ConflictError(
            "Faculty roles can only be changed after the current school year has been officially completed. " +
            `School year ${year.startYear}-${year.endYear} is ${year.status ?? "unknown"}.`
        );
    }
}

/**
 * Officially mark (or reopen) a school year. Admin-only at the route layer.
 * Reopening is the counterpart that keeps the gate honest: nothing may stay
 * "completed" while a year is still in progress.
 *
 * When marking as 'completed', all active classroom rosters for that school
 * year are cleared and enrollments completed, ensuring all required grades
 * and snapshots have been finalized.
 */
export async function setSchoolYearStatusService(
    id: number,
    status: SchoolYearStatus
): Promise<{ schoolYears: SchoolYear[]; totalCleared: number; classroomsCleared: number }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        const existing = await SYModel.getSchoolYearById(id);
        if (!existing) {
            throw new NotFoundError(`School year with ID ${id} not found`, 404);
        }

        let totalCleared = 0;
        let classroomsCleared = 0;

        if (status === "completed") {
            const clearResult = await clearAllClassroomsService(id);
            totalCleared = clearResult.totalCleared;
            classroomsCleared = clearResult.classroomsCleared;
        }

        await SYModel.setSchoolYearStatus(id, status);
        const schoolYears = await SYModel.getSchoolYear();
        invalidateByPrefix("http:GET:/schoolYear");
        return { schoolYears, totalCleared, classroomsCleared };
    } finally {
        connection.release();
    }
}