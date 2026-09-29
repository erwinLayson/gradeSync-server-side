import { Router } from "express";

import {studentReportCardController} from "../controller/studentReportCard.js";

// Authentication: a report card contains student PII, so the route may no
// longer be public (it previously had no middleware at all). Ownership is
// enforced in the controller via assertCanAccessEnrollment().
import { ValidateToken } from "../middleware/validateToken.js";

const router: Router = Router();

router.get('/student/:enrollmentId/report-card', ValidateToken, studentReportCardController);

export default router;