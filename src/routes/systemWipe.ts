import { Router } from "express";

import { wipeSystemController, wipeStatusController } from "../controller/systemWipe.js";

// Role-based access control — the data wipe is the most destructive endpoint
// in the system, so it is DEVELOPER-ONLY (docs/developer-data-wipe-plan.md).
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const devOnly = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

// Preview row counts (developer-only so the tool doesn't leak table stats).
route.get("/system/wipe/status", devOnly, wipeStatusController);

// The wipe itself. Phrase validation + self-protection live in the controller/model.
route.post("/system/wipe", devOnly, wipeSystemController);

export default route;
