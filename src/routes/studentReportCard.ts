import { Router } from "express";

import {studentReportCardController} from "../controller/studentReportCard.js";

const router: Router = Router();

router.get('/student/:enrollmentId/report-card',studentReportCardController);

export default router;