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
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const route: Router = Router();

const adminFaculty: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];
const adminFacultyWithId: RequestHandler<{ id: number }>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== ADMIN + TEACHER ====================

// Assessment CRUD
route.post("/assessments", adminFaculty, createAssessmentController);
route.get("/assessments", adminFaculty, getAssessmentsController);
route.patch("/assessments/:id", adminFacultyWithId, updateAssessmentController);
route.delete("/assessments/:id", adminFacultyWithId, deleteAssessmentController);

// Batch-save the score sheet for one assessment
route.post("/assessments/:id/scores", adminFacultyWithId, saveAssessmentScoresController);

export default route;
