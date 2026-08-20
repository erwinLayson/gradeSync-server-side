import {Router, type RequestHandler} from "express";
import { 
    createClassSubjectController, 
    updateSubjectTeacherByClassIdController,
    deleteSubjectFromClassController,
    getClassSubjectWeightsController,
    updateClassSubjectWeightsController
} from "../controller/class_subjects.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithClassId: RequestHandler<{classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithClassSubjectTeacher: RequestHandler<{classId: number, subjectId: number, teacherId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacherWithClassSubjectId: RequestHandler<{classSubjectId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN ONLY ====================

// Route to create new class subjects
route.post("/classrooms/subjects", adminOnly, createClassSubjectController);

// Patch route to update the teacher of a subject in a class by classId and subjectId
route.patch('/classrooms/:classId/subjects/', adminOnlyWithClassId, updateSubjectTeacherByClassIdController);

// Route to delete a subject from a class by classId, subjectId, and teacherId
route.delete('/classrooms/:classId/subjects/:subjectId/teachers/:teacherId', adminOnlyWithClassSubjectTeacher, deleteSubjectFromClassController);

// ==================== ADMIN + TEACHER ====================

// Routes to get / update the grading weights of a class subject
route.get('/class-subjects/:classSubjectId/weights', adminTeacherWithClassSubjectId, getClassSubjectWeightsController);
route.put('/class-subjects/:classSubjectId/weights', adminTeacherWithClassSubjectId, updateClassSubjectWeightsController);
export default route;