import {PoolConnection, type RowDataPacket} from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type { ClassStudentProps } from "../constant/class_stundents.js";



export default class ClassStudents {
    constructor(private connection: PoolConnection) {}

    async getClassStudentsByClassId(classId: number):Promise<ClassStudentProps | null>  {
        try {
            const query = `
                SELECT 
                c.id,
                c.section,
                c.gradeLevel,
                -- Class adviser (class_teacher holds at most one adviser per class)
                t.id AS adviserId,
                CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS adviserFullname
                FROM classrooms c
                LEFT JOIN class_teacher ct ON ct.classId = c.id
                LEFT JOIN teachers t ON t.id = ct.teacherId
                WHERE c.id = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);

            if(rows.length === 0) {
                return null;
            }

            return rows[0] as ClassStudentProps;
        } catch (err) {
            throw new InternalServerError("Failed to fetch class students", 500, err);
        }
    }
}