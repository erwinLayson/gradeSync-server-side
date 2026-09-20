import { Router, type RequestHandler } from "express";

import { getDashboardSummaryController } from "../controller/dashboard.js";

import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

router.get("/dashboard/summary", adminOnly, getDashboardSummaryController);

export default router;
