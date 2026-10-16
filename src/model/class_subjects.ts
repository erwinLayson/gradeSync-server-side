import {PoolConnection, type ResultSetHeader, type RowDataPacket} from "mysql2/promise";

// Error handling
import { InternalServerError } from "../middleware/errors.js";
import type {ClassSubjectProps} from "../constant/class_subjects.js";

export default class ClassSubject {
    constructor(private connection: PoolConnection) {}

    // create a new class subject
    async createClassSubject(classSubject: Omit<ClassSubjectProps, "id">[]): Promise<void> {
        try {
            const query = `INSERT INTO class_subjects (classId, subjectId, facultyId) VALUES (?, ?, ?)`;

            for(const s of classSubject) {
                const values = [s.classId, s.subjectId, s.facultyId];
                await this.connection.execute<ResultSetHeader>(query, values);
            }
        }catch(err) {
            throw new InternalServerError(`Internal Server error`, 500, err);
        }
    }

    // get class subject details by id
    async getClassSubjectDetailsById(id: number): Promise<ClassSubjectProps | null> {
        try {
            const query = `SELECT * FROM class_subjects WHERE classId = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            return rows.length > 0 ? (rows[0] as ClassSubjectProps) : null;
        } catch(err) {
            throw new InternalServerError(`Internal Server error`, 500, err);
        }
    }

    // update the faculty of a subject in a class by classId and subjectId
    async updateSubjectFacultyByClassId(classId: number, newFacultyId: Omit<ClassSubjectProps, "id" | "classId"> ) {
        try {
            const query = `UPDATE class_subjects SET facultyId = ? WHERE classId = ? AND subjectId = ?`;
            const values = [newFacultyId.facultyId, classId, newFacultyId.subjectId];
            const [response] = await this.connection.execute<ResultSetHeader>(query, values);

            return response.affectedRows;
        } catch(err) {
            throw new InternalServerError(`Internal Server error`, 500, err);
        }
    }

    async deleteSubjectFromClass(classId: number, subjectId: number, facultyId: number): Promise<void> {
        try {
            const query = `DELETE FROM class_subjects WHERE classId = ? AND subjectId = ? AND facultyId = ?`;
            const values = [classId, subjectId, facultyId];
            await this.connection.execute<ResultSetHeader>(query, values);
        } catch(err) {
            throw new InternalServerError(`Internal Server error`, 500, err);
        }
    }
}