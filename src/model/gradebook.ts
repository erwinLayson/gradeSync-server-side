import {PoolConnection, type RowDataPacket } from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type{ GradebookDetails} from "../constant/gradebook.js";

export default class GradeBook {
    constructor(private connection: PoolConnection) {};

    async getGradeBookDetailsByClassSubjectId(classSubjectId: number, _quarter?: number):Promise<GradebookDetails | null> {
        try {
            const query = `
                SELECT 
                    c.id AS classId,
                    cs.id AS classSubjectId,
                    s.id AS subjectId,
                    c.section AS classSection,
                    c.gradeLevel AS classLevel,
                    s.name AS subjectName,
                    s.code AS subjectCode,
                    COALESCE(s.hasComponents, FALSE) AS hasComponents
                FROM 
                    class_subjects cs 
                JOIN
                    classrooms c ON c.id = cs.classId 
                JOIN 
                    subjects s ON s.id = cs.subjectId
                WHERE cs.id = ? 
            `;
            const [result] = await this.connection.execute<RowDataPacket[]>(query, [classSubjectId])

            return result.length > 0 ? (result[0] as GradebookDetails) : null;
        }catch(err) {
            throw new InternalServerError("Internal server Error", 500, err);
        }
    }
}