import {Router, type RequestHandler} from 'express';

import { 
    assignTeachersToSubjectController,
    CreateSubjectController, 
    getAllSubjectController, 
    getSubjectByIdController, 
    getTeachersUnassignedToSubjectController ,
    getSubjectByIdWithTeachersController,
    getSubjectsWithAssignedTeachersNotInClassController,
    getSubjectsNotInClassController,
    unassignTeacherFromSubjectController,
    updateSubjectController,
    deleteSubjectController
} from '../controller/subjects.js';

// Role-based access control
import allowedRoles from '../middleware/allowedRoles.js';
import { ValidateToken } from '../middleware/validateToken.js';
import { ROLES } from '../constant/users.js';

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacherWithSubjectAndClass: RequestHandler<{subjectId: number, classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithClassId: RequestHandler<{classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminOnlyWithSubjectAndTeacher: RequestHandler<{subjectId: number, teacherId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
route.post('/subjects', adminOnly, CreateSubjectController);
route.put('/subjects/:id', adminOnlyWithId, updateSubjectController);
route.delete('/subjects/:id', adminOnlyWithId, deleteSubjectController);
route.get('/subjects/:id/unassigned-teachers', adminOnlyWithId, getTeachersUnassignedToSubjectController);
route.post('/subjects/:id/assign-teachers', adminOnlyWithId, assignTeachersToSubjectController);
route.delete('/subjects/:subjectId/teachers/:teacherId', adminOnlyWithSubjectAndTeacher, unassignTeacherFromSubjectController);

// ==================== ADMIN + TEACHER ====================
route.get('/subjects', adminTeacher, getAllSubjectController);
route.get('/subjects/:id', adminTeacherWithStringId, getSubjectByIdController);
route.get('/subjects/:subjectId/classrooms/:classId/assigned-teachers', adminTeacherWithSubjectAndClass, getSubjectsWithAssignedTeachersNotInClassController);
route.get('/subjects/classrooms/:classId/teachers', adminTeacherWithClassId, getSubjectsNotInClassController);

// get subject by ID with teachers
route.get('/subjects/:id/teachers', adminTeacherWithId, getSubjectByIdWithTeachersController);


export default route;
