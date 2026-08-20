import {Router, type RequestHandler} from "express"

import {
    getGradeBookDetailsByClassSubjectIdController
} from "../controller/gradebook.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminTeacherWithClassSubjectId: RequestHandler<{classSubjectId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN + TEACHER ====================
router.get('/gradebook/:classSubjectId/details', adminTeacherWithClassSubjectId, getGradeBookDetailsByClassSubjectIdController)

export default router;