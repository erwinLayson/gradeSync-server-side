import {PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type {StudentScoreInput, StudentScoreProps} from "../constant/grade.js";

export default class StudentScore {
  constructor(private connection: PoolConnection){}

  async getStudentScore(classSubjectId: number, quarter: number):Promise<StudentScoreProps[]> {
    try {
        const query = `
          SELECT 
              ss.id,
              ss.assessmentId,
              ss.enrollmentId,
              ss.score
          FROM 
              student_scores ss 
          JOIN 
              assessments a ON ss.assessmentId = a.id
          WHERE a.classSubjectId = ? AND a.quarter = ?
        `;
        const values = [classSubjectId, quarter];

        const [rows] = await this.connection.execute<RowDataPacket[]>(query, values);

        return rows as StudentScoreProps[];
    }catch(err) {
        throw new InternalServerError("Internal Server error", 500, err);
    }
  }

  // Batch save a score sheet: one score row per enrollment for the given assessment.
  // Uses ON DUPLICATE KEY UPDATE so resaving an existing score sheet is idempotent
  // (the unique key is (assessmentId, enrollmentId)).
  async upsertScoresBatch(assessmentId: number, scoreEntries: StudentScoreInput[]): Promise<void> {
    try {
      const query = `
        INSERT INTO student_scores (assessmentId, enrollmentId, score)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE score = VALUES(score), updated_at = CURRENT_TIMESTAMP
      `;
      for (const scoreEntry of scoreEntries) {
        const values = [assessmentId, scoreEntry.enrollmentId, scoreEntry.score];
        await this.connection.execute<ResultSetHeader>(query, values);
      }
    } catch (err) {
      throw new InternalServerError("Failed to save student scores", 500, err);
    }
  }

  // Remove every score row of an assessment. Called before a full-sheet save so
  // that cleared cells actually delete previously saved scores instead of
  // silently keeping them (the submitted sheet is treated as authoritative).
  async deleteScoresByAssessment(assessmentId: number): Promise<void> {
    try {
      const query = "DELETE FROM student_scores WHERE assessmentId = ?";
      await this.connection.execute<ResultSetHeader>(query, [assessmentId]);
    } catch (err) {
      throw new InternalServerError("Failed to clear student scores", 500, err);
    }
  }
}