import AssessmentModel from "../model/assessment.js"

import { getDBPoolConnection } from "../config/database.js";
import type { PoolConnection } from "mysql2/promise";
import { formatDate } from "../helper/formatDate.js";

import { BadRequestError, NotFoundError } from "../middleware/errors.js";

import type {
    AssessmentCreateProps,
    AssessmentUpdateProps
} from "../constant/assessment.js";

// ============= this function was exported and use in the gradebook service ==================
export async function getAssessmentService(details: {classSubjectId: number, quarter?: number, componentId?: number | null}, conn?: PoolConnection) {
    const {classSubjectId, quarter, componentId} = details;

    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConnection = !conn;

    try {
        
        const assessmentModel = new AssessmentModel(connection);
        const assessments = await assessmentModel.getAssessment(classSubjectId, quarter, componentId);
        const formatedAssessment = (assessments ?? []).map((assessment) => ({
            ...assessment,
            dateGiven: assessment.dateGiven ? formatDate(assessment.dateGiven) : null
        }))


        return formatedAssessment
    }catch(err) {
        throw err;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Create a new assessment and return its auto-generated id.
export async function createAssessmentService(assessmentData: AssessmentCreateProps): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const assessmentModel = new AssessmentModel(connection);
        return await assessmentModel.createAssessment(assessmentData);
    } finally {
        connection.release();
    }
}

// Update the editable fields of an assessment. Throws when the assessment
// does not exist or when no updateable field was provided.
export async function updateAssessmentService(assessmentId: number, updates: AssessmentUpdateProps): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        if (Object.keys(updates).length === 0) {
            throw new BadRequestError("No updateable fields were provided");
        }

        const assessmentModel = new AssessmentModel(connection);
        const existingAssessment = await assessmentModel.getAssessmentById(assessmentId);
        if (!existingAssessment) {
            throw new NotFoundError(`Assessment with ID ${assessmentId} not found`, 404);
        }

        await assessmentModel.updateAssessmentById(assessmentId, updates);
    } finally {
        connection.release();
    }
}

// Delete an assessment by id. Its student scores cascade-delete automatically.
export async function deleteAssessmentService(assessmentId: number): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const assessmentModel = new AssessmentModel(connection);
        const affectedRows = await assessmentModel.deleteAssessmentById(assessmentId);
        if (affectedRows === 0) {
            throw new NotFoundError(`Assessment with ID ${assessmentId} not found`, 404);
        }
    } finally {
        connection.release();
    }
}