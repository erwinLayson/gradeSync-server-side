import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError, NotFoundError } from "../middleware/errors.js";

import type { SchoolYear } from "../constant/schoolYear.js";

export default class SchoolYearModel {
    constructor(private connection: PoolConnection) {}

    async getSchoolYear(): Promise<SchoolYear[]> {
        try {
            const query = "SELECT id, startYear, endYear, isActive FROM schoolyear ORDER BY id DESC";
            const [result] = await this.connection.execute<RowDataPacket[]>(query);
            return result as SchoolYear[];
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    async getSchoolYearById(id: number): Promise<SchoolYear | null> {
        try {
            const query = "SELECT id, startYear, endYear, isActive FROM schoolyear WHERE id = ? LIMIT 1";
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
}
