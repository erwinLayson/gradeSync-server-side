import {PoolConnection, type RowDataPacket, type ResultSetHeader} from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";


import type{AssessmentProps, AssessmentCreateProps, AssessmentUpdateProps} from "../constant/assessment.js";

export default class Assessment {
    constructor(private connection: PoolConnection) {};

    async getAssessment(classSubjectId: number, quarter?: number):Promise<AssessmentProps[] | null> {
        try {
            const query = `
                SELECT 
                * 
                FROM assessments a 
                WHERE a.classSubjectId = ? ${quarter !== undefined ? "AND a.quarter = ?" : ""}
            `;

            const values: (string | number)[] = [classSubjectId]

            if(quarter !== undefined) {
                values.push(quarter)
            }

            const [result] = await this.connection.execute<RowDataPacket[]>(query, values)

            return result.length > 0 ? (result as AssessmentProps[]) : null;
        }catch(err) {
            throw new InternalServerError("Internal server Error", 500, err);
        }  
    }

    // Create a new assessment for a class subject within a specific quarter.
    // Returns the auto-generated id of the new assessment.
    async createAssessment(assessmentData: AssessmentCreateProps): Promise<number> {
        const { classSubjectId, quarter, type, title, maxScore, dateGiven } = assessmentData;
        try {
            const query = `
                INSERT INTO assessments (classSubjectId, quarter, type, title, maxScore, dateGiven)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            const values = [classSubjectId, quarter, type, title, maxScore, dateGiven ?? null];
            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create assessment", 500, err);
        }
    }

    // Get a single assessment by its id, or null when it does not exist.
    async getAssessmentById(assessmentId: number): Promise<AssessmentProps | null> {
        try {
            const query = `
                SELECT *
                FROM assessments
                WHERE id = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [assessmentId]);
            if (rows.length === 0) {
                return null;
            }
            return rows[0] as AssessmentProps;
        } catch (err) {
            throw new InternalServerError("Failed to fetch assessment", 500, err);
        }
    }

    // Update the editable fields of an assessment. Returns the number of rows changed.
    async updateAssessmentById(assessmentId: number, updates: AssessmentUpdateProps): Promise<number> {
        const updateFields: string[] = [];
        const updateValues: (string | number | null)[] = [];

        if (updates.title !== undefined) {
            updateFields.push("title = ?");
            updateValues.push(updates.title);
        }
        if (updates.type !== undefined) {
            updateFields.push("type = ?");
            updateValues.push(updates.type);
        }
        if (updates.maxScore !== undefined) {
            updateFields.push("maxScore = ?");
            updateValues.push(updates.maxScore);
        }
        if (updates.dateGiven !== undefined) {
            updateFields.push("dateGiven = ?");
            updateValues.push(updates.dateGiven);
        }

        if (updateFields.length === 0) {
            return 0;
        }

        try {
            const query = `UPDATE assessments SET ${updateFields.join(", ")} WHERE id = ?`;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [...updateValues, assessmentId]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to update assessment", 500, err);
        }
    }

    // Delete an assessment by its id. Its student scores are removed
    // automatically by the ON DELETE CASCADE foreign key. Returns rows deleted.
    async deleteAssessmentById(assessmentId: number): Promise<number> {
        try {
            const query = "DELETE FROM assessments WHERE id = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [assessmentId]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to delete assessment", 500, err);
        }
    }
}