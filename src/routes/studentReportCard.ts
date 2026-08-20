import { Router } from "express";

import {studentReportCarController} from "../controller/studentReportCard.js";

const router: Router = Router();

router.get('/student/:enrollmentId/report-card',studentReportCarController);

export default router;