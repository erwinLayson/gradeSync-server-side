import {Router, type RequestHandler} from 'express';import {
    CreateClassroomController, 
    getAllClassroomController, 
    getClassroomByIdController,
    getClassroomFacultiesWithSubjectController,
    getClassAdviserController,
    setClassAdviserController,
    updateClassroomController,
    archiveClassroomController,
    getMyAdvisedClassController,
    getMyAdvisedClassHonorStudentsController
} from '../controller/classrooms.js';

import { getClassSubjectDetailsByIdController } from '../controller/class_subjects.js';

// Role-based access control
import allowedRoles from '../middleware/allowedRoles.js';
import { allowedFacultyRoles } from '../middleware/allowedFacultyRoles.js';
import { ValidateToken } from '../middleware/validateToken.js';
import { ROLES } from '../constant/users.js';
import { FACULTY_ROLES } from '../constant/faculties.js';

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithStringId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Teaching-capability routes: the user role proves a faculty account; the
// faculty guard makes the teacher requirement explicit so a register faculty
// member is refused at the route layer.
const adminFacultyWithStringId: RequestHandler<{id: string}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];
const adminFacultyWithId: RequestHandler<{id: number}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== REGISTER (registration/enrollment staff) ====================
// Register reads the section list and its subjects while assigning a student to
// a section. Classroom create/update/archive/adviser stay Admin-only.
// (docs/register-role-implementation-plan.md §6.2)
//
// After the migration there is no user-level `register` role, so the register read
// path is authorized through the authenticated user's verified faculty record
// (`faculties.role === "register"`).
const adminRegisterWithClassroomId: RequestHandler<{classroomId: string}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];
// Section list is also read by Faculties (dashboard + gradebook/class list) to
// resolve section names and student counts.
const adminRegisterFaculty: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== ADMIN ONLY ====================
route.post('/classrooms', adminOnly, CreateClassroomController);
route.put('/classrooms/:id', adminOnlyWithStringId, updateClassroomController);
route.delete('/classrooms/:id', adminOnlyWithStringId, archiveClassroomController);
route.put('/classrooms/:id/adviser', adminOnly, setClassAdviserController);

// ==================== TEACHER ONLY ====================
route.get('/classrooms/my-advised-class', [ValidateToken, allowedRoles([ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER])], getMyAdvisedClassController);
route.get('/classrooms/my-advised-class/honor-students', [ValidateToken, allowedRoles([ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER])], getMyAdvisedClassHonorStudentsController);

// ==================== ADMIN + TEACHER ====================
route.get('/classrooms/:id/adviser', adminFacultyWithStringId, getClassAdviserController);
route.get('/classrooms/:id', adminFacultyWithStringId, getClassroomByIdController);

// Convenience alias so callers can explicitly request the point-in-time stable
// classroom view used by audit code that cares about mid-request drift (P5). It is
// the same handler as GET /classrooms/:id; the path is informational only.

// ==================== ADMIN + REGISTER + TEACHER (section list) ====================
// Read-only enrollment lookups shared with Register (and Faculty above for the
// adviser/section detail routes).
route.get('/classrooms', adminRegisterFaculty, getAllClassroomController);
route.get('/classrooms/:classroomId/faculties-subject', adminRegisterWithClassroomId, getClassroomFacultiesWithSubjectController);

// This route is imported from the class_subjects controller to get class subject details by ID
route.get('/classrooms/details/:id', adminFacultyWithId, getClassSubjectDetailsByIdController);

export default route;