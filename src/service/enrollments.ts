import Enrollments from "../model/enrollments.js";
import { getDBPoolConnection } from "../config/database.js";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { EnrollmentCreateProps } from "../constant/enrollments.js";

import { ConflictError, ForbiddenError, NotFoundError, BadRequestError } from "../middleware/errors.js";

// Service function to create a new enrollment
import {updateStudentByIdService} from "./students.js"
import { getAcademicSettingsService } from "./academicSettings.js";


// Create a new enrollment: enrollments + class_students + enrollment_details
// If the student was previously unenrolled in the same school year, this
// updates the existing enrollment (Option A) instead of creating a duplicate.
export async function createEnrollmentService(enrollment: EnrollmentCreateProps) {
    // Enforce the admin-controlled enrollment window (fail-open if no settings row).
    const settings = await getAcademicSettingsService();
    if (settings && !settings.enrollmentOpen) {
        throw new ForbiddenError("Enrollment is currently closed. Reopen it in Admin Settings to enroll students.");
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const enrollmentModel = new Enrollments(connection);

        // Check if student already has an enrollment in this school year
        const existingEnrollment = await enrollmentModel.getExistingEnrollment(
            enrollment.studentId,
            enrollment.schoolYearId
        );

        if (existingEnrollment) {
            // Student has an existing enrollment — check status
            if (existingEnrollment.status === "enrolled") {
                throw new ConflictError("Student is already enrolled in this school year");
            }

            if (existingEnrollment.status === "completed") {
                throw new ConflictError("Student has a completed enrollment in this school year and cannot be re-enrolled.");
            }

            // Student was unenrolled — check if current quarter is finished
            const academicSettings = await getAcademicSettingsService();
            const currentQuarter = academicSettings?.currentQuarter ?? 1;

            // Check if student has grades for the current quarter
            const hasCurrentQuarterGrades = await enrollmentModel.hasGradesForQuarter(
                existingEnrollment.id,
                currentQuarter
            );

            if (hasCurrentQuarterGrades) {
                throw new BadRequestError(
                    `Cannot transfer student: they have grades for Quarter ${currentQuarter}. ` +
                    `Please wait until the current quarter is finished before re-enrolling.`
                );
            }

            // Quarter is finished (or no grades) — safe to transfer
            // 1. Delete old enrollment data
            await enrollmentModel.deleteEnrollmentDetailsByEnrollmentId(existingEnrollment.id);
            await enrollmentModel.deleteStudentScoresByEnrollmentId(existingEnrollment.id);
            await enrollmentModel.deleteStudentAttendanceByEnrollmentId(existingEnrollment.id);
            await enrollmentModel.deleteClassStudentByEnrollmentId(existingEnrollment.id);

            // 2. Update enrollment to new class
            await enrollmentModel.updateEnrollmentClass(existingEnrollment.id, enrollment.classId);

            // 3. Set status back to 'enrolled'
            await enrollmentModel.updateEnrollmentStatus(existingEnrollment.id, "enrolled");

            // 4. Create new class link
            await enrollmentModel.createClassStudent(enrollment.classId, existingEnrollment.id);

            // 5. Create new subject links
            for (const subjectId of enrollment.subjectIds) {
                await enrollmentModel.createEnrollmentDetail(existingEnrollment.id, subjectId);
            }

            // Student status stays "active"
            await updateStudentByIdService(enrollment.studentId, { status: "active" }, connection);

            await connection.commit();
            return existingEnrollment.id;
        }

        // No existing enrollment — create new one
        const enrollmentId = await enrollmentModel.createEnrollment(
            enrollment.classId,
            enrollment.schoolYearId,
            enrollment.studentId
        );

        await enrollmentModel.createClassStudent(enrollment.classId, enrollmentId);

        for (const subjectId of enrollment.subjectIds) {
            await enrollmentModel.createEnrollmentDetail(enrollmentId, subjectId);
        }

        // Student status stays "active" (enrollment status is tracked on the enrollment record)
        await updateStudentByIdService(enrollment.studentId, { status: "active" }, connection);

        await connection.commit();
        return enrollmentId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Remove a single student from a classroom (soft-delete enrollment)
export async function removeStudentFromClassService(classId: number, enrollmentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const enrollmentModel = new Enrollments(connection);

        // Verify the enrollment exists and belongs to this classroom
        const enrollment = await enrollmentModel.getEnrollmentById(enrollmentId);
        if (!enrollment) {
            throw new NotFoundError("Enrollment not found", 404);
        }
        if (enrollment.classId !== classId) {
            throw new BadRequestError("Enrollment does not belong to this classroom");
        }
        if (enrollment.status !== "enrolled") {
            throw new ConflictError("Student is not currently enrolled");
        }

        const studentId = enrollment.studentId;

        // 1. Delete enrollment_details (subjects linked to this enrollment)
        await enrollmentModel.deleteEnrollmentDetailsByEnrollmentId(enrollmentId);

        // 2. Delete class_students (unlink student from classroom)
        await enrollmentModel.deleteClassStudentByEnrollmentId(enrollmentId);

        // 3. Soft-delete the enrollment (set status to 'unenrolled')
        await enrollmentModel.softDeleteEnrollment(enrollmentId);

        // 4. Student status remains "active" (they can be re-enrolled later)
        await updateStudentByIdService(studentId, { status: "active" }, connection);

        await connection.commit();
        return enrollmentId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Bulk-remove students from a classroom
export async function bulkRemoveStudentsFromClassService(classId: number, enrollmentIds: number[]) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const enrollmentModel = new Enrollments(connection);
        const removedIds: number[] = [];

        for (const enrollmentId of enrollmentIds) {
            // Verify the enrollment exists and belongs to this classroom
            const enrollment = await enrollmentModel.getEnrollmentById(enrollmentId);
            if (!enrollment) {
                throw new NotFoundError(`Enrollment #${enrollmentId} not found`, 404);
            }
            if (enrollment.classId !== classId) {
                throw new BadRequestError(`Enrollment #${enrollmentId} does not belong to this classroom`);
            }
            if (enrollment.status !== "enrolled") {
                throw new ConflictError(`Enrollment #${enrollmentId} is not currently enrolled`);
            }

            const studentId = enrollment.studentId;

            // 1. Delete enrollment_details
            await enrollmentModel.deleteEnrollmentDetailsByEnrollmentId(enrollmentId);

            // 2. Delete class_students
            await enrollmentModel.deleteClassStudentByEnrollmentId(enrollmentId);

            // 3. Soft-delete the enrollment
            await enrollmentModel.softDeleteEnrollment(enrollmentId);

            // 4. Student status remains "active"
            await updateStudentByIdService(studentId, { status: "active" }, connection);

            removedIds.push(enrollmentId);
        }

        await connection.commit();
        return removedIds;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}


// Clear all students from a single classroom
// Deletes scores, attendance, enrollment details, class links, and submission records.
// Marks enrollment as 'completed'.
export async function clearAllFromClassService(classId: number): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const enrollmentModel = new Enrollments(connection);
        const enrollmentIds = await enrollmentModel.getActiveEnrollmentIdsByClassId(classId);

        if (enrollmentIds.length === 0) {
            return 0;
        }

        await connection.beginTransaction();
        try {
            for (const enrollmentId of enrollmentIds) {
                // 1. Delete student scores
                await enrollmentModel.deleteStudentScoresByEnrollmentId(enrollmentId);

                // 2. Delete student attendance
                await enrollmentModel.deleteStudentAttendanceByEnrollmentId(enrollmentId);

                // 3. Delete enrollment details (subject links)
                await enrollmentModel.deleteEnrollmentDetailsByEnrollmentId(enrollmentId);

                // 4. Delete class_students (class-enrollment link)
                await enrollmentModel.deleteClassStudentByEnrollmentId(enrollmentId);

                // 5. Delete student_academic_record_quarters (submission status)
                const recordId = await enrollmentModel.getRecordIdByEnrollmentId(enrollmentId);
                if (recordId) {
                    await enrollmentModel.deleteRecordQuartersByRecordId(recordId);
                }

                // 6. Mark enrollment as completed
                await enrollmentModel.updateEnrollmentStatus(enrollmentId, "completed");
            }

            // 7. Clear assessments for all class subjects in this classroom
            const classSubjectIds = await enrollmentModel.getClassSubjectIdsByClassId(classId);
            for (const csId of classSubjectIds) {
                await enrollmentModel.deleteAssessmentsByClassSubjectId(csId);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        }

        return enrollmentIds.length;
    } finally {
        connection.release();
    }
}

// Clear all students from ALL active classrooms in the active school year.
export async function clearAllClassroomsService(): Promise<{ totalCleared: number; classroomsCleared: number }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const enrollmentModel = new Enrollments(connection);

        // Get the active school year
        const [yearRows] = await connection.execute<RowDataPacket[]>(
            "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1"
        );
        const schoolYearId = yearRows[0]?.id;
        if (!schoolYearId) {
            return { totalCleared: 0, classroomsCleared: 0 };
        }

        // Get all active classroom IDs for this school year
        const classIds = await enrollmentModel.getActiveClassIdsBySchoolYear(schoolYearId);

        let totalCleared = 0;
        let classroomsCleared = 0;

        for (const classId of classIds) {
            const cleared = await clearAllFromClassService(classId);
            if (cleared > 0) {
                totalCleared += cleared;
                classroomsCleared++;
            }
        }

        return { totalCleared, classroomsCleared };
    } finally {
        connection.release();
    }
}

export async function getAllEnrollmentRecordByStudentId(studentId: number, existingConnection?: PoolConnection) {
        const pool = getDBPoolConnection();
        const connection = existingConnection ?? await pool.getConnection();
        const ownConnection = !existingConnection;
    try {
        const enrollmentModel = new Enrollments(connection);
        const studentEnrollmentRecord = await enrollmentModel.getStudentEnrollmentRecordByStudentId(studentId);

        return studentEnrollmentRecord;
    }catch(err) {
        throw err;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}