import {Router, type RequestHandler} from "express";
import { 
    createClassSubjectController, 
    updateSubjectFacultyByClassIdController,
    deleteSubjectFromClassController,
    getClassSubjectWeightsController,
    updateClassSubjectWeightsController
} from "../controller/class_subjects.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithClassId: RequestHandler<{classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithClassSubjectFaculty: RequestHandler<{classId: number, subjectId: number, facultyId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Grading weights are a teaching capability: the user role proves a faculty
// account, the faculty guard pins it to faculties.role === "teacher".
const adminFacultyWithClassSubjectId: RequestHandler<{classSubjectId: number}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== ADMIN ONLY ====================

// Route to create new class subjects
route.post("/classrooms/subjects", adminOnly, createClassSubjectController);

// Patch route to update the faculty of a subject in a class by classId and subjectId
route.patch('/classrooms/:classId/subjects/', adminOnlyWithClassId, updateSubjectFacultyByClassIdController);

// Route to delete a subject from a class by classId, subjectId, and facultyId
route.delete('/classrooms/:classId/subjects/:subjectId/faculties/:facultyId', adminOnlyWithClassSubjectFaculty, deleteSubjectFromClassController);

// ==================== ADMIN + TEACHER ====================

// Routes to get / update the grading weights of a class subject
route.get('/class-subjects/:classSubjectId/weights', adminFacultyWithClassSubjectId, getClassSubjectWeightsController);
route.put('/class-subjects/:classSubjectId/weights', adminFacultyWithClassSubjectId, updateClassSubjectWeightsController);
export default route;