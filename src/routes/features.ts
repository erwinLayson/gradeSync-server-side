import { Router, type RequestHandler } from "express";

import { getAllFeaturesController, getFeatureFlagMapController, updateFeatureController } from "../controller/features.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { cacheResponse } from "../middleware/cache.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const anyAuthenticated: RequestHandler[] = [ValidateToken];
const adminDeveloper: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.DEVELOPER])];
const developerOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

// ==================== ANY AUTHENTICATED USER ====================
// The flag map must stay open to every role — all frontends consume it.
router.get("/features", anyAuthenticated, cacheResponse({ ttl: 60_000 }), getFeatureFlagMapController);

// ==================== ADMIN + DEVELOPER ====================
// Full rows with labels/descriptions for the developer UI.
router.get("/features/list", adminDeveloper, cacheResponse({ ttl: 60_000 }), getAllFeaturesController);

// ==================== DEVELOPER ONLY ====================
// Server-side authorization is mandatory (plan §6.1).
router.patch("/features/:key", developerOnly, updateFeatureController);

export default router;
