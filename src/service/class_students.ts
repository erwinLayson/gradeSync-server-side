import ClassStudent from "../model/class_students.js";
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";


import {getStudentByClassroomIdService} from "./students.js"
import { formatDate } from "../helper/formatDate.js"

export async function getClassStudentsByClassIdService(classId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classStudentModel = new ClassStudent(connection);
        const classrooms = await classStudentModel.getClassStudentsByClassId(classId);

        const students = await getStudentByClassroomIdService(classId, connection); // Call the function to get students by classroom ID

        const classStudents = {
            ...classrooms,
            students: students.map(s => ({
                ...s,
                // Shared, timezone-safe formatter (was new Date(...) here too).
                studentBirthdate: formatDate(s.studentBirthdate)
            }))
        }

        if(!classStudents) {
            throw new NotFoundError("Class students not found", 404);
        }

        return classStudents;
    }finally {
        connection.release();
    }
}