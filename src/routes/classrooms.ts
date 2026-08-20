import {Router, type RequestHandler} from 'express';import {
    CreateClassroomController, 
    getAllClassroomController, 
    getClassroomByIdController, 
    getClassroomTeachersWithSubjectController,
    getClassAdviserController,
    setClassAdviserController,
    updateClassroomController,
    archiveClassroomController
} from '../controller/classrooms.js';

import { getClassSubjectDetailsByIdController } from '../controller/class_subjects.js';

// Role-based access control
import allowedRoles from '../middleware/allowedRoles.js';
import { ValidateToken } from '../middleware/validateToken.js';
import { ROLES } from '../constant/users.js';

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithClassroomId: RequestHandler<{classroomId: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN ONLY ====================
route.post('/classrooms', adminOnly, CreateClassroomController);
route.put('/classrooms/:id', adminOnlyWithStringId, updateClassroomController);
route.delete('/classrooms/:id', adminOnlyWithStringId, archiveClassroomController);
route.put('/classrooms/:id/adviser', adminOnly, setClassAdviserController);

// ==================== ADMIN + TEACHER ====================
route.get('/classrooms', adminTeacher, getAllClassroomController);
route.get('/classrooms/:id/adviser', adminTeacherWithStringId, getClassAdviserController);
route.get('/classrooms/:id', adminTeacherWithStringId, getClassroomByIdController);
route.get('/classrooms/:classroomId/teachers-subject', adminTeacherWithClassroomId, getClassroomTeachersWithSubjectController);

// This route is imported from the class_subjects controller to get class subject details by ID
route.get('/classrooms/details/:id', adminTeacherWithId, getClassSubjectDetailsByIdController);

export default route;