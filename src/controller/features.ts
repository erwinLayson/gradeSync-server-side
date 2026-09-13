import type { Request, Response, NextFunction } from "express";

import { getAllFeaturesService, getFeatureFlagMapService, updateFeatureService } from "../service/features.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

import type { FeatureUpdateProps } from "../constant/features.js";

// GET /api/features
// The flag map consumed by FeatureFlagProvider on every role's frontend.
// Must NOT be role-gated to developer (plan §3.3).
export async function getFeatureFlagMapController(_req: Request, res: Response, next: NextFunction) {
    try {
        const map = await getFeatureFlagMapService();
        res.status(200).json(
            SuccessResponse({
                message: "Feature flags retrieved successfully",
                data: map,
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/features/list
// Full rows (label, description, audit fields) for the developer UI.
export async function getAllFeaturesController(_req: Request, res: Response, next: NextFunction) {
    try {
        const features = await getAllFeaturesService();
        res.status(200).json(
            SuccessResponse({
                message: "Features retrieved successfully",
                data: features,
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /api/features/:key
// Developer only (enforced by route middleware). Body: { enabled: boolean }.
export async function updateFeatureController(req: Request<{ key: string }, {}, FeatureUpdateProps>, res: Response, next: NextFunction) {
    try {
        const { key } = req.params;
        const updates = req.body;

        if (updates.enabled === undefined || typeof updates.enabled !== "boolean") {
            throw new BadRequestError("enabled must be a boolean");
        }
        if (!key || key.length > 64) {
            throw new BadRequestError("Invalid feature key");
        }

        const developerId = req.user?.id;
        if (!developerId) {
            throw new BadRequestError("Authenticated user required");
        }

        const updated = await updateFeatureService(key, updates, developerId);
        res.status(200).json(
            SuccessResponse({
                message: `Feature "${updated.label}" ${updated.enabled ? "enabled" : "disabled"} successfully`,
                data: updated,
            })
        );
    } catch (err) {
        next(err);
    }
}
