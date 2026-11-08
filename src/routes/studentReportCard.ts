import { Router } from "express";

import {
    bulkStudentReportCardController,
    studentReportCardController,
} from "../controller/studentReportCard.js";

// Authentication: a report card contains student PII, so the route may no
// longer be public (it previously had no middleware at all). Ownership is
// enforced in the controller via assertCanAccessEnrollment() and adviser checks.
import { ValidateToken } from "../middleware/validateToken.js";

const router: Router = Router();

router.get("/student/:enrollmentId/report-card", ValidateToken, studentReportCardController);
router.get("/student/class/:classId/report-cards/bulk", ValidateToken, bulkStudentReportCardController);

export default router;
