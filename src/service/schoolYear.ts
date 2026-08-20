import { getDBPoolConnection } from "../config/database.js";

import SchoolYearModel from "../model/schoolYear.js"
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import type { SchoolYear } from "../constant/schoolYear.js";


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