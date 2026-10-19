import Enrollments from "../model/enrollments.js";
import { getDBPoolConnection } from "../config/database.js";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { EnrollmentCreateProps } from "../constant/enrollments.js";

import { ConflictError, ForbiddenError, NotFoundError, BadRequestError } from "../middleware/errors.js";

// Service function to create a new enrollment
import {updateStudentByIdService} from "./students.js"
import { getAcademicSettingsService, getNumQuarters } from "./academicSettings.js";


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

        // Verify that classroom exists and matches the chosen grade level
        const [classRows] = await connection.execute<RowDataPacket[]>(
            "SELECT id, section, gradeLevel FROM classrooms WHERE id = ? LIMIT 1",
            [enrollment.classId]
        );
        const classroom = classRows[0];
        if (!classroom) {
            throw new NotFoundError("Selected classroom not found", 404);
        }
        if (Number(classroom.gradeLevel) !== Number(enrollment.gradeLevel)) {
            throw new BadRequestError(
                `The selected classroom (${classroom.section}) is Grade ${classroom.gradeLevel}, which does not match the chosen grade level (Grade ${enrollment.gradeLevel}).`
            );
        }

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


// The cleanup precondition (audit F-4): the operational rows this cleanup
// deletes (scores, per-subject attendance, enrollment links, assessments) are
// only recoverable from the frozen student academic record. So before ANY row
// is removed, every active enrollment of the class must already hold a COMPLETE
// snapshot for ALL configured grading periods.
//
// A record row alone is NOT sufficient — the check also requires the required
// subject rows (enrollment_details ∩ the class's class_subjects), a non-null
// grade in every configured quarter on each of those rows, and a 'submitted'
// ledger row per configured quarter. `numQuarters` comes from the admin's
// academic settings (3 or 4), so a 3-quarter school is measured against 3.
async function assertClassSnapshotsComplete(
    connection: PoolConnection,
    classId: number,
    numQuarters: number
): Promise<void> {
    const enrollmentModel = new Enrollments(connection);
    const rows = await enrollmentModel.getSnapshotCompletenessByClassId(classId, numQuarters);

    const problems: string[] = [];
    for (const row of rows) {
        const reasons: string[] = [];
        if (row.recordId === null) {
            reasons.push("no submitted academic record");
        } else {
            if (row.submittedQuarters < numQuarters) {
                reasons.push(`${row.submittedQuarters} of ${numQuarters} quarter(s) submitted`);
            }
            if (row.requiredSubjects > 0 && row.frozenSubjects < row.requiredSubjects) {
                reasons.push(`${row.frozenSubjects} of ${row.requiredSubjects} subject row(s) frozen`);
            }
            if (row.subjectsMissingGrades > 0) {
                reasons.push(`${row.subjectsMissingGrades} subject row(s) missing a grade in a required quarter`);
            }
        }
        if (reasons.length > 0) {
            problems.push(`${row.fullname} (${reasons.join("; ")})`);
        }
    }

    if (problems.length > 0) {
        const shown = problems.slice(0, 5).join(", ");
        const more = problems.length > 5 ? ` and ${problems.length - 5} more` : "";
        throw new ConflictError(
            `Cannot clear this classroom: ${problems.length} student record(s) are missing the finalized grade ` +
            `history this cleanup would delete — ${shown}${more}. Submit every required quarter for all students ` +
            `(each with a grade) before clearing. No data was deleted.`
        );
    }
}

// Clear all students from a single classroom.
// Deletes scores, attendance, enrollment details, class links, and the class's
// assessments. Marks each enrollment as 'completed'.
//
// The frozen history is deliberately PRESERVED: student_academic_records, its
// subject/component rows and the per-quarter submission ledger all stay intact
// (the ledger is the audit trail of who finalized what and when — audit F-4).
// The precondition above guarantees nothing unrecoverable is deleted, and both
// the check and the deletes run in ONE transaction after row-locking the
// enrollments and records, so a concurrent grade finalization cannot interleave.
export async function clearAllFromClassService(classId: number): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const enrollmentModel = new Enrollments(connection);
        const numQuarters = await getNumQuarters();

        await connection.beginTransaction();
        try {
            // 1. Lock the affected enrollments (FOR UPDATE) so an enrollment
            //    change cannot land between the completeness check and the deletes.
            const enrollmentIds = await enrollmentModel.lockActiveEnrollmentIdsByClassId(classId);

            if (enrollmentIds.length === 0) {
                await connection.commit();
                return 0;
            }

            // 2. Lock the frozen records + submission ledger we are about to read,
            //    serialising against a concurrent freezeRecordWithin() submit.
            const recordIds = await enrollmentModel.lockAcademicRecordIdsByEnrollmentIds(enrollmentIds);
            await enrollmentModel.lockRecordQuarterIdsByRecordIds(recordIds);

            // 3. Reject the whole cleanup when any required snapshot is missing.
            await assertClassSnapshotsComplete(connection, classId, numQuarters);

            for (const enrollmentId of enrollmentIds) {
                // Delete student scores
                await enrollmentModel.deleteStudentScoresByEnrollmentId(enrollmentId);

                // Delete student attendance
                await enrollmentModel.deleteStudentAttendanceByEnrollmentId(enrollmentId);

                // Delete enrollment details (subject links)
                await enrollmentModel.deleteEnrollmentDetailsByEnrollmentId(enrollmentId);

                // Delete class_students (class-enrollment link)
                await enrollmentModel.deleteClassStudentByEnrollmentId(enrollmentId);

                // NOTE: student_academic_record_quarters is intentionally NOT
                // deleted here — the submission ledger is historical audit data.

                // Mark enrollment as completed (history, not a deleted year)
                await enrollmentModel.updateEnrollmentStatus(enrollmentId, "completed");
            }

            // Clear assessments for all class subjects in this classroom
            const classSubjectIds = await enrollmentModel.getClassSubjectIdsByClassId(classId);
            for (const csId of classSubjectIds) {
                await enrollmentModel.deleteAssessmentsByClassSubjectId(csId);
            }

            await connection.commit();
            return enrollmentIds.length;
        } catch (err) {
            await connection.rollback();
            throw err;
        }
    } finally {
        connection.release();
    }
}

// Clear all students from ALL active classrooms in the specified (or active) school year.
export async function clearAllClassroomsService(targetSchoolYearId?: number): Promise<{ totalCleared: number; classroomsCleared: number }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const enrollmentModel = new Enrollments(connection);

        let schoolYearId = targetSchoolYearId;
        if (!schoolYearId) {
            // Get the active school year
            const [yearRows] = await connection.execute<RowDataPacket[]>(
                "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1"
            );
            schoolYearId = yearRows[0]?.id;
        }
        if (!schoolYearId) {
            return { totalCleared: 0, classroomsCleared: 0 };
        }

        // Get all active classroom IDs for this school year
        const classIds = await enrollmentModel.getActiveClassIdsBySchoolYear(schoolYearId);

        // Pre-flight the precondition for EVERY classroom before clearing any of
        // them. clearAllFromClassService re-checks under row locks, but that is
        // per-class and each class commits on its own — without this pass a
        // failure on the 3rd class would leave classes 1-2 already cleared.
        const numQuarters = await getNumQuarters();
        for (const classId of classIds) {
            await assertClassSnapshotsComplete(connection, classId, numQuarters);
        }

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