import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError, NotFoundError } from "../middleware/errors.js";

import type { SchoolYear, SchoolYearStatus } from "../constant/schoolYear.js";

const SCHOOL_YEAR_COLUMNS = "id, startYear, endYear, isActive, status";

export default class SchoolYearModel {
    constructor(private connection: PoolConnection) {}

    async getSchoolYear(): Promise<SchoolYear[]> {
        try {
            const query = `SELECT ${SCHOOL_YEAR_COLUMNS} FROM schoolyear ORDER BY id DESC`;
            const [result] = await this.connection.execute<RowDataPacket[]>(query);
            return result as SchoolYear[];
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    async getSchoolYearById(id: number): Promise<SchoolYear | null> {
        try {
            const query = `SELECT ${SCHOOL_YEAR_COLUMNS} FROM schoolyear WHERE id = ? LIMIT 1`;
            const [result] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            return (result[0] as SchoolYear) ?? null;
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    async getSchoolYearByStartYear(startYear: number): Promise<SchoolYear | null> {
        try {
            const query = "SELECT * FROM schoolyear WHERE startYear = ? LIMIT 1";
            const [result] = await this.connection.execute<RowDataPacket[]>(query, [String(startYear)]);
            return (result[0] as SchoolYear) ?? null;
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    async createSchoolYear(startYear: number, endYear: number): Promise<number> {
        try {
            const query = "INSERT INTO schoolyear(startYear, endYear) VALUES(?,?)";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [String(startYear), String(endYear)]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    // Make `id` the single active school year (all other rows are cleared).
    async activateSchoolYear(id: number): Promise<void> {
        try {
            const query = "UPDATE schoolyear SET isActive = (id = ?)";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);
            if (result.affectedRows === 0) {
                throw new NotFoundError(`School year with ID ${id} not found`, 404);
            }
        } catch (err) {
            if (err instanceof NotFoundError) {
                throw err;
            }
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    // Officially mark a school year as completed (or reopen it).
    async setSchoolYearStatus(id: number, status: SchoolYearStatus): Promise<void> {
        try {
            const query = "UPDATE schoolyear SET status = ? WHERE id = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [status, id]);
            if (result.affectedRows === 0) {
                throw new NotFoundError(`School year with ID ${id} not found`, 404);
            }
        } catch (err) {
            if (err instanceof NotFoundError) {
                throw err;
            }
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    // The school year whose status gates faculty role changes — the ACTIVE year
    // when one exists, otherwise the most recent one. Read FOR UPDATE inside the
    // caller's transaction so a concurrent "complete year" / "activate next year"
    // cannot be interleaved with the role change that depends on it.
    // Returns null when the table is empty: with nothing to verify, the caller
    // must REFUSE the role change (docs/faculty-role-implementation-plan.md §7).
    async getCurrentSchoolYearForUpdate(): Promise<SchoolYear | null> {
        try {
            const active = await this.connection.execute<RowDataPacket[]>(
                `SELECT ${SCHOOL_YEAR_COLUMNS} FROM schoolyear WHERE isActive = 1 ORDER BY id DESC LIMIT 1 FOR UPDATE`
            );
            const activeRows = active[0] as SchoolYear[];
            if (activeRows.length > 0) {
                return activeRows[0] ?? null;
            }
            const newest = await this.connection.execute<RowDataPacket[]>(
                `SELECT ${SCHOOL_YEAR_COLUMNS} FROM schoolyear ORDER BY id DESC LIMIT 1 FOR UPDATE`
            );
            const rows = newest[0] as SchoolYear[];
            return rows[0] ?? null;
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }
}
