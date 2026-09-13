import type { Request, Response, NextFunction } from "express";

import { getLandingContentService, updateLandingSectionService } from "../service/landingContent.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError, NotFoundError } from "../middleware/errors.js";
import { validateLandingSectionContent } from "../helper/validateLandingContent.js";

import type { LandingSectionKey } from "../constant/landingContent.js";
import { LANDING_SECTION_KEYS } from "../constant/landingContent.js";

// GET /landing-content
// PUBLIC (no ValidateToken): the landing page renders for anonymous visitors.
// Exposes only presentational content that the page already shows publicly.
export async function getLandingContentController(_req: Request, res: Response, next: NextFunction) {
    try {
        const map = await getLandingContentService();
        res.status(200).json(
            SuccessResponse({
                message: "Landing content retrieved successfully",
                data: map,
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /landing-content/:section
// Developer only (enforced by route middleware). Body = the section's content
// shape, validated per-section; extra fields are dropped (rebuild-on-validate).
export async function updateLandingSectionController(
    req: Request<{ section: string }>,
    res: Response,
    next: NextFunction,
) {
    try {
        const { section } = req.params;

        if (!section || section.length > 64 || !(LANDING_SECTION_KEYS as readonly string[]).includes(section)) {
            // Unknown section = resource does not exist → 404 (plan §3.3 contract).
            throw new NotFoundError("Unknown landing section", 404);
        }
        const sectionKey = section as LandingSectionKey;

        if (req.body === undefined || req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new BadRequestError("Request body must be the section's content object");
        }

        const developerId = req.user?.id;
        if (!developerId) {
            throw new BadRequestError("Authenticated user required");
        }

        // Validate + sanitize (throws BadRequestError with a precise message).
        const content = validateLandingSectionContent(sectionKey, req.body);

        const updated = await updateLandingSectionService(sectionKey, content, developerId);
        res.status(200).json(
            SuccessResponse({
                message: `Landing section "${updated.section}" updated successfully`,
                data: updated,
            })
        );
    } catch (err) {
        next(err);
    }
}
