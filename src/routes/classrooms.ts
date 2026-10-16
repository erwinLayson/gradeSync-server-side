import {Router, type RequestHandler} from 'express';import {
    CreateClassroomController, 
    getAllClassroomController, 
    getClassroomByIdController,
    getClassroomTeachersWithSubjectController,
    getClassAdviserController,
    setClassAdviserController,
    updateClassroomController,
    archiveClassroomController,
    getMyAdvisedClassController
} from '../controller/classrooms.js';

import { getClassSubjectDetailsByIdController } from '../controller/class_subjects.js';

// Role-based access control
import allowedRoles from '../middleware/allowedRoles.js';
import { ValidateToken } from '../middleware/validateToken.js';
import { ROLES } from '../constant/users.js';

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacherWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== REGISTER (registration/enrollment staff) ====================
// Register reads the section list and its subjects while assigning a student to
// a section. Classroom create/update/archive/adviser stay Admin-only.
// (docs/register-role-implementation-plan.md §6.2)
const adminRegisterWithClassroomId: RequestHandler<{classroomId: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.REGISTER])];
// Section list is also read by Teachers (dashboard + gradebook/class list) to
// resolve section names and student counts.
const adminRegisterTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.REGISTER, ROLES.TEACHER])];

// ==================== ADMIN ONLY ====================
route.post('/classrooms', adminOnly, CreateClassroomController);
route.put('/classrooms/:id', adminOnlyWithStringId, updateClassroomController);
route.delete('/classrooms/:id', adminOnlyWithStringId, archiveClassroomController);
route.put('/classrooms/:id/adviser', adminOnly, setClassAdviserController);

// ==================== TEACHER ONLY ====================
route.get('/classrooms/my-advised-class', [ValidateToken, allowedRoles([ROLES.TEACHER])], getMyAdvisedClassController);

// ==================== ADMIN + TEACHER ====================
route.get('/classrooms/:id/adviser', adminTeacherWithStringId, getClassAdviserController);
route.get('/classrooms/:id', adminTeacherWithStringId, getClassroomByIdController);

// Convenience alias so callers can explicitly request the point-in-time stable
// classroom view used by audit code that cares about mid-request drift (P5). It is
// the same handler as GET /classrooms/:id; the path is informational only.

// ==================== ADMIN + REGISTER + TEACHER (section list) ====================
// Read-only enrollment lookups shared with Register (and Teacher above for the
// adviser/section detail routes).
route.get('/classrooms', adminRegisterTeacher, getAllClassroomController);
route.get('/classrooms/:classroomId/teachers-subject', adminRegisterWithClassroomId, getClassroomTeachersWithSubjectController);

// This route is imported from the class_subjects controller to get class subject details by ID
route.get('/classrooms/details/:id', adminTeacherWithId, getClassSubjectDetailsByIdController);

export default route;