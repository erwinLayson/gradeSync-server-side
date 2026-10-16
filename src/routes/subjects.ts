import {Router, type RequestHandler} from 'express';

import { 
    assignFacultiesToSubjectController,
    CreateSubjectController, 
    getAllSubjectController, 
    getSubjectByIdController, 
    getFacultiesUnassignedToSubjectController ,
    getSubjectByIdWithFacultiesController,
    getSubjectsWithAssignedFacultiesNotInClassController,
    getSubjectsNotInClassController,
    unassignFacultyFromSubjectController,
    updateSubjectController,
    deleteSubjectController
} from '../controller/subjects.js';

// Role-based access control
import allowedRoles from '../middleware/allowedRoles.js';
import { allowedFacultyRoles } from '../middleware/allowedFacultyRoles.js';
import { ValidateToken } from '../middleware/validateToken.js';
import { ROLES } from '../constant/users.js';
import { FACULTY_ROLES } from '../constant/faculties.js';

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Subject + faculty rosters are a teaching surface, so the faculty guard pins
// the caller to faculties.role === "teacher".
const adminFaculty: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminFacultyWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminFacultyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminFacultyWithSubjectAndClass: RequestHandler<{subjectId: number, classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminFacultyWithClassId: RequestHandler<{classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminOnlyWithSubjectAndFaculty: RequestHandler<{subjectId: number, facultyId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
route.post('/subjects', adminOnly, CreateSubjectController);
route.put('/subjects/:id', adminOnlyWithId, updateSubjectController);
route.delete('/subjects/:id', adminOnlyWithId, deleteSubjectController);
route.get('/subjects/:id/unassigned-faculties', adminOnlyWithId, getFacultiesUnassignedToSubjectController);
route.post('/subjects/:id/assign-faculties', adminOnlyWithId, assignFacultiesToSubjectController);
route.delete('/subjects/:subjectId/faculties/:facultyId', adminOnlyWithSubjectAndFaculty, unassignFacultyFromSubjectController);

// ==================== ADMIN + TEACHER ====================
route.get('/subjects', adminFaculty, getAllSubjectController);
route.get('/subjects/:id', adminFacultyWithStringId, getSubjectByIdController);
route.get('/subjects/:subjectId/classrooms/:classId/assigned-faculties', adminFacultyWithSubjectAndClass, getSubjectsWithAssignedFacultiesNotInClassController);
route.get('/subjects/classrooms/:classId/faculties', adminFacultyWithClassId, getSubjectsNotInClassController);

// get subject by ID with faculties
route.get('/subjects/:id/faculties', adminFacultyWithId, getSubjectByIdWithFacultiesController);


export default route;
