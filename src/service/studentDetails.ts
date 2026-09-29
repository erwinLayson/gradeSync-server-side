import { getDBPoolConnection } from "../config/database.js";

import StudentDetailsModel from "../model/studentDetails.js";

// Error handling
import { NotFoundError } from "../middleware/errors.js";

import type { StudentDetailsUpdateProps } from "../constant/studentDetails.js";

function formatBirthdate(raw: unknown): string | null {
    // students.birthdate is nullable. Guard before any String() coercion, otherwise a
    // NULL column serializes as the literal text "null", which is not a date.
    if (raw === null || raw === undefined) {
        return null;
    }

    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) {
            return null;
        }
        return [
            raw.getFullYear(),
            String(raw.getMonth() + 1).padStart(2, "0"),
            String(raw.getDate()).padStart(2, "0")
        ].join("-");
    }

    const value = String(raw).slice(0, 10);
    return value === "" ? null : value;
}

function serializeStudentRow(row: any) {
    return {
        id: row.id,
        lrn: row.lrn,
        email: row.email,
        firstname: row.firstname,
        middlename: row.middlename,
        lastname: row.lastname,
        suffix: row.suffix ?? null,
        fullname: [row.firstname, row.middlename, row.lastname]
            .filter(Boolean)
            .join(" ") + (row.suffix ? ` ${row.suffix}` : ""),
        birthdate: formatBirthdate(row.birthdate),
        sex: row.sex
    };
}

// The logged-in user's own student record + additional details (one round trip).
export async function getMyStudentProfileService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentDetailsModel(connection);

        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        const [studentRow, details] = await Promise.all([
            model.getStudentRow(studentId),
            model.getStudentDetailsByStudentId(studentId)
        ]);

        if (studentRow === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        return {
            student: serializeStudentRow(studentRow),
            details: details ?? null
        };
    } finally {
        connection.release();
    }
}

// Upsert the logged-in user's own additional details; returns the fresh record.
export async function updateMyStudentDetailsService(userId: number, updates: StudentDetailsUpdateProps) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentDetailsModel(connection);

        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        await model.upsertStudentDetails(studentId, updates);

        const details = await model.getStudentDetailsByStudentId(studentId);
        if (details === null) {
            throw new NotFoundError("Student details not found after save", 404);
        }
        return details;
    } finally {
        connection.release();
    }
}
