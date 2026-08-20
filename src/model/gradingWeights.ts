import { PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

import { InternalServerError, NotFoundError } from "../middleware/errors.js";
import type { GradeWeights } from "../constant/grade.js";

export default class GradingWeight {
    constructor(private connection: PoolConnection) {}

    async getGradingWeights(classSubjectId: number):Promise<GradeWeights> {
        let rows: RowDataPacket[];

        try {
            const query = `
                SELECT 
                *
                FROM 
                    grading_weights 
                WHERE classSubjectId = ?
            `;

            const [result] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId]);
            rows = result;
        }catch(err) {
            throw new InternalServerError(`Internal server err`, 500, err);
        }

        // Thrown outside the try block so the catch above cannot re-wrap it as a 500
        if (rows.length === 0) {
            throw new NotFoundError(`Grading weights for class subject ${classSubjectId} not found`, 404);
        }

        return rows[0] as GradeWeights;
    }

    // Whether a class_subjects row exists for this id, so the API can return a
    // friendly 404 instead of a raw FK error when saving weights for a bad id.
    async classSubjectExists(classSubjectId: number): Promise<boolean> {
        try {
            const query = `SELECT id FROM class_subjects WHERE id = ? LIMIT 1`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId]);
            return rows.length > 0;
        }catch(err) {
            throw new InternalServerError(`Internal server err`, 500, err);
        }
    }

    // Insert a weights row for a class subject, or update it when one already
    // exists (classSubjectId is UNIQUE, so this is an idempotent upsert).
    async upsertGradingWeights(classSubjectId: number, weights: GradeWeights): Promise<void> {
        try {
            const query = `
                INSERT INTO grading_weights
                    (classSubjectId, writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    writtenWorkWeight = VALUES(writtenWorkWeight),
                    performanceTaskWeight = VALUES(performanceTaskWeight),
                    quarterlyAssessmentWeight = VALUES(quarterlyAssessmentWeight),
                    attendanceWeight = VALUES(attendanceWeight)
            `;
            const values = [
                classSubjectId,
                weights.writtenWorkWeight,
                weights.performanceTaskWeight,
                weights.quarterlyAssessmentWeight,
                weights.attendanceWeight
            ];
            await this.connection.execute<ResultSetHeader>(query, values);
        }catch(err) {
            throw new InternalServerError(`Failed to save grading weights`, 500, err);
        }
    }
}