import { Router } from "express";
import {
    getActivityAuditDetailController,
    getActivityAuditLogsController,
    getActivityAuditStatsController,
} from "../controller/activityAudit.js";
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly = [ValidateToken, allowedRoles([ROLES.ADMIN])];

router.get("/activity-audit", adminOnly, getActivityAuditLogsController);
router.get("/activity-audit/stats", adminOnly, getActivityAuditStatsController);
router.get("/activity-audit/:id", adminOnly, getActivityAuditDetailController);

export default router;
