import { Router, type RequestHandler } from "express";

import {
    createAssessmentController,
    getAssessmentsController,
    updateAssessmentController,
    deleteAssessmentController,
    saveAssessmentScoresController
} from "../controller/assessments.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{ id: number }>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN + TEACHER ====================

// Assessment CRUD
route.post("/assessments", adminTeacher, createAssessmentController);
route.get("/assessments", adminTeacher, getAssessmentsController);
route.patch("/assessments/:id", adminTeacherWithId, updateAssessmentController);
route.delete("/assessments/:id", adminTeacherWithId, deleteAssessmentController);

// Batch-save the score sheet for one assessment
route.post("/assessments/:id/scores", adminTeacherWithId, saveAssessmentScoresController);

export default route;
