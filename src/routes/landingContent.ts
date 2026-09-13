import { Router, type RequestHandler } from "express";

import { getLandingContentController, updateLandingSectionController } from "../controller/landingContent.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const publicRead: RequestHandler[] = [];
const developerOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

// ==================== PUBLIC (no auth) ====================
// The landing page renders pre-login, so this read cannot sit behind auth.
// It exposes only presentational content the page already shows publicly.
router.get("/landing-content", publicRead, getLandingContentController);

// ==================== DEVELOPER ONLY ====================
// Server-side authorization is mandatory (plan §6.1).
router.patch("/landing-content/:section", developerOnly, updateLandingSectionController);

export default router;
