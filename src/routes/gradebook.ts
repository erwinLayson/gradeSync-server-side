import {Router, type RequestHandler} from "express"

import {
    getGradeBookDetailsByClassSubjectIdController
} from "../controller/gradebook.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const router: Router = Router();

const adminFacultyWithClassSubjectId: RequestHandler<{classSubjectId: number}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== ADMIN + TEACHER ====================
router.get('/gradebook/:classSubjectId/details', adminFacultyWithClassSubjectId, getGradeBookDetailsByClassSubjectIdController)

export default router;