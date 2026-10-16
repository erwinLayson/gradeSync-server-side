import { getDBPoolConnection } from "../config/database.js";

import SchoolYearModel from "../model/schoolYear.js"
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";
import type { SchoolYear, SchoolYearStatus } from "../constant/schoolYear.js";


export async function getSchoolYearService() {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        const sy = SYModel.getSchoolYear();
        return sy;
    }finally {
        connection.release();
    }
}

// Create a new school year for the current academic period
export async function createSchoolYearService(): Promise<SchoolYear> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        const startYear = new Date().getFullYear();
        const endYear = startYear + 1;

        const existing = await SYModel.getSchoolYearByStartYear(startYear);
        if (existing) {
            throw new ConflictError(`School year ${startYear} - ${endYear} already exists`);
        }

        const id = await SYModel.createSchoolYear(startYear, endYear);
        return { id, startYear: String(startYear), endYear: String(endYear) };
    }finally {
        connection.release();
    }
}

// Make `id` the single active school year. Returns the refreshed list.
export async function activateSchoolYearService(id: number): Promise<SchoolYear[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        const existing = await SYModel.getSchoolYearById(id);
        if (!existing) {
            throw new NotFoundError(`School year with ID ${id} not found`, 404);
        }

        await SYModel.activateSchoolYear(id);
        return await SYModel.getSchoolYear();
    }finally {
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
 */
export async function setSchoolYearStatusService(id: number, status: SchoolYearStatus): Promise<SchoolYear[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const SYModel = new SchoolYearModel(connection);
        const existing = await SYModel.getSchoolYearById(id);
        if (!existing) {
            throw new NotFoundError(`School year with ID ${id} not found`, 404);
        }

        await SYModel.setSchoolYearStatus(id, status);
        return await SYModel.getSchoolYear();
    } finally {
        connection.release();
    }
}