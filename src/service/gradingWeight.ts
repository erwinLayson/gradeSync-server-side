import GradingWeightModel from "../model/gradingWeights.js"
import { getDBPoolConnection } from "../config/database.js";
import type { PoolConnection } from "mysql2/promise";

import { NotFoundError } from "../middleware/errors.js";
import { getEffectiveDefaultWeightsService } from "./gradingWeightDefaults.js";
import type { GradeWeights } from "../constant/grade.js";
import { DEFAULT_GRADING_WEIGHTS } from "../constant/grade.js";


// Fallback used when a class subject has no grading_weights row: the admin
// configurable DB default first, then the DepEd code constants if the defaults
// table is missing or empty.
async function getFallbackWeights(connection: PoolConnection): Promise<GradeWeights> {
    const dbDefaults = await getEffectiveDefaultWeightsService(connection);
    return dbDefaults ?? { ...DEFAULT_GRADING_WEIGHTS };
}

export async function getGradingWeightsService(classSubjectId: number, conn?: PoolConnection): Promise<GradeWeights> {
    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConn = !conn

    try {
        const gradingWeightsModel = new GradingWeightModel(connection);

        const storedGradingWeights = await gradingWeightsModel.getGradingWeights(classSubjectId)

        return storedGradingWeights;
    }catch(err) {
        // A missing grading_weights row surfaces as NotFoundError from the model.
        // The API deliberately falls back to the configured default instead of
        // 404ing (the model's NotFoundError remains as a safety net for direct model use).
        if (err instanceof NotFoundError) {
            return getFallbackWeights(connection);
        }
        throw err;
    }finally {
        if(ownConn) {
            connection.release();
        }
    }
}

// Effective weights for one class subject from the API's perspective: 404 when
// the class subject does not exist, the stored row when one exists, or the
// DepEd defaults when it exists but has no weights row yet.
export async function getGradingWeightsForClassSubjectService(classSubjectId: number, conn?: PoolConnection): Promise<GradeWeights> {
    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConn = !conn;

    try {
        const gradingWeightsModel = new GradingWeightModel(connection);

        if (!(await gradingWeightsModel.classSubjectExists(classSubjectId))) {
            throw new NotFoundError(`Class subject ${classSubjectId} not found`, 404);
        }

        try {
            return await gradingWeightsModel.getGradingWeights(classSubjectId);
        } catch (err) {
            if (err instanceof NotFoundError) {
                return getFallbackWeights(connection);
            }
            throw err;
        }
    }finally {
        if(ownConn) {
            connection.release();
        }
    }
}

// Create or update the weights of one class subject. The class subject must
// exist (friendly 404 instead of a raw FK error); the weight values themselves
// are validated by the controller before this runs (sum <= 100, mirroring the
// chk_weights_total CHECK constraint).
export async function upsertGradingWeightsService(classSubjectId: number, weights: GradeWeights, conn?: PoolConnection): Promise<GradeWeights> {
    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConn = !conn;

    try {
        const gradingWeightsModel = new GradingWeightModel(connection);

        if (!(await gradingWeightsModel.classSubjectExists(classSubjectId))) {
            throw new NotFoundError(`Class subject ${classSubjectId} not found`, 404);
        }

        await gradingWeightsModel.upsertGradingWeights(classSubjectId, weights);

        return weights;
    }finally {
        if(ownConn) {
            connection.release();
        }
    }
}