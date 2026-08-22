import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type { SubjectComponent, ComponentCreateProps, ComponentUpdateProps } from "../constant/subjectComponents.js";

export default class SubjectComponents {
    constructor(private connection: PoolConnection) {}

    // Get all components for a subject
    async getSubjectComponents(parentSubjectId: number): Promise<SubjectComponent[]> {
        try {
            const query = `
                SELECT id, parentSubjectId, name, code, weight, createdAt
                FROM subject_components
                WHERE parentSubjectId = ?
                ORDER BY id ASC
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [parentSubjectId]);
            return rows as SubjectComponent[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subject components", 500, err);
        }
    }

    // Get a single component by ID
    async getComponentById(id: number): Promise<SubjectComponent | null> {
        try {
            const query = `
                SELECT id, parentSubjectId, name, code, weight, createdAt
                FROM subject_components
                WHERE id = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            return rows.length > 0 ? (rows[0] as SubjectComponent) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch subject component", 500, err);
        }
    }

    // Create a new component
    async createComponent(data: ComponentCreateProps & { parentSubjectId: number }): Promise<number> {
        const { parentSubjectId, name, code, weight } = data;
        try {
            const query = `
                INSERT INTO subject_components (parentSubjectId, name, code, weight)
                VALUES (?, ?, ?, ?)
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [
                parentSubjectId,
                name,
                code,
                weight,
            ]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create subject component", 500, err);
        }
    }

    // Batch create components (used during subject creation)
    async createComponentsBatch(parentSubjectId: number, components: ComponentCreateProps[]): Promise<number[]> {
        const ids: number[] = [];
        for (const comp of components) {
            const id = await this.createComponent({ ...comp, parentSubjectId });
            ids.push(id);
        }
        return ids;
    }

    // Update a component
    async updateComponent(id: number, data: ComponentUpdateProps): Promise<number> {
        const updateFields: string[] = [];
        const updateValues: (string | number)[] = [];

        if (data.name !== undefined) {
            updateFields.push("name = ?");
            updateValues.push(data.name);
        }
        if (data.code !== undefined) {
            updateFields.push("code = ?");
            updateValues.push(data.code);
        }
        if (data.weight !== undefined) {
            updateFields.push("weight = ?");
            updateValues.push(data.weight);
        }

        if (updateFields.length === 0) {
            return 0;
        }

        try {
            const query = `UPDATE subject_components SET ${updateFields.join(", ")} WHERE id = ?`;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [...updateValues, id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to update subject component", 500, err);
        }
    }

    // Delete a component
    async deleteComponent(id: number): Promise<number> {
        try {
            const query = "DELETE FROM subject_components WHERE id = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to delete subject component", 500, err);
        }
    }

    // Check if subject has components
    async hasComponents(subjectId: number): Promise<boolean> {
        try {
            const query = `
                SELECT COUNT(*) as cnt
                FROM subject_components
                WHERE parentSubjectId = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId]);
            return Number(rows[0]?.cnt ?? 0) > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check subject components", 500, err);
        }
    }

    // Get total weight for a subject's components
    async getTotalWeight(parentSubjectId: number): Promise<number> {
        try {
            const query = `
                SELECT COALESCE(SUM(weight), 0) as totalWeight
                FROM subject_components
                WHERE parentSubjectId = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [parentSubjectId]);
            return Number(rows[0]?.totalWeight ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to calculate component weight", 500, err);
        }
    }

    // Get components by IDs (used for frozen records)
    async getComponentsByIds(ids: number[]): Promise<SubjectComponent[]> {
        if (ids.length === 0) {
            return [];
        }
        try {
            const placeholders = ids.map(() => "?").join(", ");
            const query = `
                SELECT id, parentSubjectId, name, code, weight, createdAt
                FROM subject_components
                WHERE id IN (${placeholders})
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, ids);
            return rows as SubjectComponent[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subject components", 500, err);
        }
    }
}
