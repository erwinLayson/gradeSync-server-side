import { Router, type RequestHandler } from "express";

import { getGradingWeightDefaultsController, updateGradingWeightDefaultsController } from "../controller/gradingWeightDefaults.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { cacheResponse } from "../middleware/cache.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
router.get("/grading-weight-defaults", adminOnly, cacheResponse({ ttl: 300_000, shared: true }), getGradingWeightDefaultsController);
router.patch("/grading-weight-defaults", adminOnly, updateGradingWeightDefaultsController);

export default router;
