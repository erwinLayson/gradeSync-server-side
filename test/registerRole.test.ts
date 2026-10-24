import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

import getEnv from "../src/helper/getEnv.js";

// The register routes authorize through the verified faculty guard, which
// resolves faculties.role from the DB. This matrix test must not depend on a
// live database, so the faculty lookup is stubbed: the guard under test still
// runs for real (allow-list, admin bypass, missing-record refusal), but reads
// the synthetic role the harness sets for each case.
const facultyStub = vi.hoisted(() => ({
    role: null as string | null,
    exists: true,
}));

vi.mock("../src/config/database.js", () => ({
    getDBPoolConnection: () => ({
        getConnection: async () => ({ release() {} }),
    }),
    checkDBConnection: async () => {},
}));

vi.mock("../src/model/faculties.js", () => ({
    default: class {
        async getFacultyByUserId() {
            if (!facultyStub.exists) return null;
            return {
                id: 1,
                userId: 1,
                email: "t@test.local",
                fullname: "Test Faculty",
                role: facultyStub.role,
            };
        }
    },
}));

import enrollmentsRouter from "../src/routes/enrollments.js";
import studentsRouter from "../src/routes/students.js";
import studentRecordRouter from "../src/routes/studentRecord.js";
import studentReportCardRouter from "../src/routes/studentReportCard.js";
import schoolYearRouter from "../src/routes/schoolYear.js";
import academicSettingsRouter from "../src/routes/academicSettings.js";
import classroomsRouter from "../src/routes/classrooms.js";
import classSubjectsRouter from "../src/routes/class_subjects.js";
import usersRouter from "../src/routes/users.js";

import { ROLES } from "../src/constant/users.js";
import { FACULTY_ROLES } from "../src/constant/faculties.js";

/** Register-role authorization matrix (faculty-role path)
 * (docs/register-role-implementation-plan.md §6.2/§6.3, §13.5).
 *
 * Once `register` stopped being a user role, register-staff routes are protected
 * through the combined role + verified-faculty guard. This test exercises that
 * real guard chain: it walks each Express router's stack, finds the route, and
 * runs the registered handlers with a synthetic caller that includes a verified
 * `req.faculty` record. It proves that:
 *   - register faculty reach the register-staff controllers,
 *   - teacher faculty are refused on register-only endpoints,
 *   - admins still reach shared admin+register surfaces,
 *   - teaching-only endpoints refuse register faculty.
 *
 * The `ValidateToken` layers run against a real signed token and the async
 * faculty guard is awaited; only the faculty DB lookup is stubbed, so the test
 * stays free of a live database while still exercising the real guard logic.
 */

type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

/** Narrowed aliases so the helper signatures type-check against the real role
 * constants instead of trying to index a value as a type. */
type UserRole = typeof ROLES[keyof typeof ROLES];
type FacultyRoleValue = typeof FACULTY_ROLES[keyof typeof FACULTY_ROLES];

interface RouteLayer {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: unknown }[] | { handle: unknown }[];
    };
}

interface FakeResponse {
    statusCode: number;
    status(code: number): FakeResponse;
    json(): FakeResponse;
    send(): FakeResponse;
}

type GuardFn = (req: Record<string, unknown>, res: FakeResponse, next: () => void) => unknown;

/** Handlers registered on `METHOD path` in the given router, in order. */
function findHandlers(router: unknown, method: HttpMethod, path: string): unknown[] {
    const stack = (router as { stack: RouteLayer[] }).stack;
    const layer = stack.find(
        (entry) => entry.route && entry.route.path === path && entry.route.methods[method] === true,
    );
    if (!layer?.route) {
        throw new Error(`No ${method.toUpperCase()} ${path} route found in router`);
    }
    return layer.route.stack.map((registered) => registered.handle);
}

/** The route's HTTP-method + path label, used in test names. */
function routeLabel(method: HttpMethod, path: string): string {
    return `${method.toUpperCase()} ${path}`;
}

/** Runs the route's handler chain and reports the authorization decision.
 *
 * The chain is executed in order and AWAITED, so the async faculty guard
 * (`allowedFacultyRoles`) is fully resolved before the next layer runs. The
 * final handler is the controller: reaching it means every guard passed. The
 * controller itself is never invoked (it would touch the DB).
 */
async function decideWithFaculty(
    router: unknown,
    method: HttpMethod,
    path: string,
    actorRole: UserRole,
    facultyRole: FacultyRoleValue | null,
    params?: Record<string, string>,
): Promise<"reached-controller" | number> {
    const handlers = findHandlers(router, method, path);

    // Drive the stubbed faculty lookup with this case's expected faculty role.
    facultyStub.role = facultyRole;
    facultyStub.exists = facultyRole !== null;

    let currentReq: Record<string, unknown> = {
        cookies: { login_token: jwt.sign({ id: 1, email: "t@test.local", role: actorRole }, getEnv("JWT_SECRET")) },
        user: { id: 1, email: "t@test.local", role: actorRole },
        params: params ?? {},
    };

    const res: FakeResponse = {
        statusCode: 200,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json() {
            return this;
        },
        send() {
            return this;
        },
    };

    for (let i = 0; i < handlers.length; i++) {
        // The last registered handler is the controller.
        if (i === handlers.length - 1) {
            return "reached-controller";
        }

        const handler = handlers[i] as GuardFn;
        const req: Record<string, unknown> = currentReq;

        let nextCalled = false;
        let nextError: unknown;
        await Promise.resolve(
            handler(req, res, ((error?: unknown) => {
                nextCalled = true;
                nextError = error;
            }) as () => void),
        );

        if (nextError) {
            throw nextError;
        }
        if (!nextCalled) return res.statusCode;

        currentReq = req;
    }

    return "reached-controller";
}

async function isRegisterReached(router: unknown, method: HttpMethod, path: string, params?: Record<string, string>): Promise<boolean> {
    return (await decideWithFaculty(router, method, path, ROLES.TEACHER, FACULTY_ROLES.REGISTER, params)) === "reached-controller";
}

async function isTeacherReached(router: unknown, method: HttpMethod, path: string, params?: Record<string, string>): Promise<boolean> {
    return (await decideWithFaculty(router, method, path, ROLES.TEACHER, FACULTY_ROLES.TEACHER, params)) === "reached-controller";
}

async function isAdminReached(router: unknown, method: HttpMethod, path: string, params?: Record<string, string>): Promise<boolean> {
    return (await decideWithFaculty(router, method, path, ROLES.ADMIN, null, params)) === "reached-controller";
}

function inferParams(method: HttpMethod, path: string): Record<string, string> | undefined {
    if (method !== "get") {
        return { id: "1" };
    }
    return undefined;
}

async function registerDenied(router: unknown, method: HttpMethod, path: string, params?: Record<string, string>): Promise<boolean> {
    return (await decideWithFaculty(router, method, path, ROLES.TEACHER, FACULTY_ROLES.REGISTER, params)) !== "reached-controller";
}

async function teacherDenied(router: unknown, method: HttpMethod, path: string, params?: Record<string, string>): Promise<boolean> {
    return (await decideWithFaculty(router, method, path, ROLES.TEACHER, FACULTY_ROLES.TEACHER, params)) !== "reached-controller";
}

// ==================== the authorization matrix ====================

/** Endpoints register-staff reach through the verified faculty role. */
const REGISTER_FACULTY_REACHABLE: Array<[label: string, router: unknown, method: HttpMethod, path: string]> = [
    ["enroll a student", enrollmentsRouter, "post", "/enrollments"],
    ["create a student + login", studentsRouter, "post", "/students"],
    ["list all students", studentsRouter, "get", "/students"],
    ["search not-yet-enrolled students", studentsRouter, "get", "/students/not-enrolled"],
    ["read student detail", studentsRouter, "get", "/students/:id/students"],
    ["read student academic history", studentsRouter, "get", "/students/:id/academic-history"],
    ["read past submitted grades", studentsRouter, "get", "/students/:id/past-submitted-grades"],
    // Register owns the student registry: it edits and soft-deletes student records.
    ["edit a student", studentsRouter, "patch", "/students/:id"],
    ["soft-delete a student", studentsRouter, "delete", "/students/:id"],
    ["list classrooms", classroomsRouter, "get", "/classrooms"],
    ["read a classroom's subjects", classroomsRouter, "get", "/classrooms/:classroomId/faculties-subject"],
    ["read school years", schoolYearRouter, "get", "/schoolYear"],
    ["create a school year", schoolYearRouter, "post", "/schoolYear"],
    ["read academic settings", academicSettingsRouter, "get", "/academic-settings"],
    ["advance academic settings", academicSettingsRouter, "patch", "/academic-settings"],
    ["submission summary", studentRecordRouter, "get", "/student-records/summary"],
    ["class records drilldown", studentRecordRouter, "get", "/student-records/class/:classId"],
    ["print SF10 / Form-137", studentRecordRouter, "get", "/student-records/:id/pdf"],
    // Every role manages its OWN login credentials; the controller enforces
    // "own account or admin".
    ["update its own email/password", usersRouter, "put", "/users/:id"],
];

/** Endpoints teacher faculty are NOT allowed to reach (register-only work). */
const TEACHER_FACULTY_DENIED: Array<[label: string, router: unknown, method: HttpMethod, path: string]> = [
    ["enroll a student", enrollmentsRouter, "post", "/enrollments"],
    ["create a student + login", studentsRouter, "post", "/students"],
    ["search not-yet-enrolled students", studentsRouter, "get", "/students/not-enrolled"],
    ["edit a student", studentsRouter, "patch", "/students/:id"],
    ["soft-delete a student", studentsRouter, "delete", "/students/:id"],
    ["print SF10 / Form-137", studentRecordRouter, "get", "/student-records/:id/pdf"],
    ["create a school year", schoolYearRouter, "post", "/schoolYear"],
];

/** Endpoints register faculty are NOT allowed to reach (admin-only or teacher-only). */
const REGISTER_FACULTY_DENIED: Array<[label: string, router: unknown, method: HttpMethod, path: string]> = [
    // Destructive / management enrollment actions stay Admin-only.
    ["enrollment active-count", enrollmentsRouter, "get", "/enrollments/active-count"],
    ["bulk-remove a classroom's enrollments", enrollmentsRouter, "delete", "/classrooms/:classId/enrollments"],
    ["clear a classroom", enrollmentsRouter, "delete", "/classrooms/:classId/enrollments/clear"],
    ["clear all classrooms", enrollmentsRouter, "delete", "/enrollments/clear-all"],
    // School-year management (activating stays Admin-only).
    ["activate a school year", schoolYearRouter, "patch", "/schoolYear/:id/activate"],
    // Classroom management.
    ["create a classroom", classroomsRouter, "post", "/classrooms"],
    ["update a classroom", classroomsRouter, "put", "/classrooms/:id"],
    ["archive a classroom", classroomsRouter, "delete", "/classrooms/:id"],
    ["set a class adviser", classroomsRouter, "put", "/classrooms/:id/adviser"],
    // Teaching-only surfaces that register staff must not access.
    ["read the adviser's own class records", studentRecordRouter, "get", "/student-records/my-class"],
    ["read a class subject's weights", classSubjectsRouter, "get", "/class-subjects/:classSubjectId/weights"],
];

describe("Register-role route authorization (faculty-role path)", () => {
    it.each(REGISTER_FACULTY_REACHABLE)(
        "allows a verified register faculty to reach %s",
        async (_label, router, method, path) => {
            expect(await isRegisterReached(router, method, path, inferParams(method, path))).toBe(true);
        },
    );

    it.each(TEACHER_FACULTY_DENIED)(
        "denies a verified teacher faculty access to %s",
        async (_label, router, method, path) => {
            expect(await teacherDenied(router, method, path, inferParams(method, path))).toBe(true);
        },
    );

    it.each(REGISTER_FACULTY_DENIED)(
        "denies a verified register faculty access to %s",
        async (_label, router, method, path) => {
            expect(await registerDenied(router, method, path, inferParams(method, path))).toBe(true);
        },
    );
});

describe("admin access to the shared register surfaces is preserved", () => {
    it("allows admins to reach the shared register-staff routes", async () => {
        expect(await isAdminReached(enrollmentsRouter, "post", "/enrollments", inferParams("post", "/enrollments"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "post", "/students", inferParams("post", "/students"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/not-enrolled", inferParams("get", "/students/not-enrolled"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students", inferParams("get", "/students"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "patch", "/students/:id", inferParams("patch", "/students/:id"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "delete", "/students/:id", inferParams("delete", "/students/:id"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/:id/students", inferParams("get", "/students/:id/students"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/:id/academic-history", inferParams("get", "/students/:id/academic-history"))).toBe(true);
        expect(await isAdminReached(studentRecordRouter, "get", "/student-records/:id/pdf", inferParams("get", "/student-records/:id/pdf"))).toBe(true);
        expect(await isAdminReached(classroomsRouter, "get", "/classrooms", inferParams("get", "/classrooms"))).toBe(true);
        expect(await isAdminReached(schoolYearRouter, "get", "/schoolYear", inferParams("get", "/schoolYear"))).toBe(true);
        expect(await isAdminReached(academicSettingsRouter, "get", "/academic-settings", inferParams("get", "/academic-settings"))).toBe(true);
    });
});

describe("existing user-role checks are unchanged for non-faculty routes", () => {
    it("admin retains the shared enrollment, student-creation, and SF10 routes", async () => {
        expect(await isAdminReached(enrollmentsRouter, "post", "/enrollments", inferParams("post", "/enrollments"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "post", "/students", inferParams("post", "/students"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/not-enrolled", inferParams("get", "/students/not-enrolled"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students", inferParams("get", "/students"))).toBe(true);
        expect(await isAdminReached(studentsRouter, "patch", "/students/:id")).toBe(true);
        expect(await isAdminReached(studentsRouter, "delete", "/students/:id")).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/:id/students")).toBe(true);
        expect(await isAdminReached(studentsRouter, "get", "/students/:id/academic-history")).toBe(true);
        expect(await isAdminReached(studentRecordRouter, "get", "/student-records/:id/pdf")).toBe(true);
        expect(await isAdminReached(classroomsRouter, "get", "/classrooms")).toBe(true);
        expect(await isAdminReached(schoolYearRouter, "get", "/schoolYear")).toBe(true);
        expect(await isAdminReached(schoolYearRouter, "post", "/schoolYear")).toBe(true);
        expect(await isAdminReached(academicSettingsRouter, "get", "/academic-settings")).toBe(true);
    });

    it("teaching faculty read the shared student registry but not register-only work", async () => {
        // Shared admin + teacher + register read surfaces.
        expect(await isTeacherReached(studentsRouter, "get", "/students", inferParams("get", "/students"))).toBe(true);
        expect(await isTeacherReached(studentsRouter, "get", "/students/:id/students", inferParams("get", "/students/:id/students"))).toBe(true);
        expect(await isTeacherReached(studentsRouter, "get", "/students/:id/academic-history", inferParams("get", "/students/:id/academic-history"))).toBe(true);
        expect(await isTeacherReached(classroomsRouter, "get", "/classrooms", inferParams("get", "/classrooms"))).toBe(true);

        // Register-only registration work stays closed to teaching faculty.
        expect(await teacherDenied(enrollmentsRouter, "post", "/enrollments", inferParams("post", "/enrollments"))).toBe(true);
        expect(await teacherDenied(studentsRouter, "post", "/students", inferParams("post", "/students"))).toBe(true);
        expect(await teacherDenied(studentsRouter, "get", "/students/not-enrolled", inferParams("get", "/students/not-enrolled"))).toBe(true);
        expect(await teacherDenied(studentsRouter, "patch", "/students/:id", inferParams("patch", "/students/:id"))).toBe(true);
        expect(await teacherDenied(studentsRouter, "delete", "/students/:id", inferParams("delete", "/students/:id"))).toBe(true);
    });

    it("faculty cannot generate the SF10 PDF", async () => {
        expect(await teacherDenied(studentRecordRouter, "get", "/student-records/:id/pdf")).toBe(true);
    });

    it("student cannot enroll, create, list, edit or delete students, or print SF10", async () => {
        expect(await decideWithFaculty(enrollmentsRouter, "post", "/enrollments", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentsRouter, "post", "/students", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentsRouter, "get", "/students/not-enrolled", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentsRouter, "get", "/students", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentsRouter, "patch", "/students/:id", ROLES.STUDENT, null)).toBe(403);
        expect(await decideWithFaculty(studentsRouter, "delete", "/students/:id", ROLES.STUDENT, null)).toBe(403);
    });

    it("a faculty account with no linked faculty record is refused on register-only routes", async () => {
        // users.role = teacher but no faculties row: the faculty guard must refuse
        // rather than fall through to a granted register capability.
        facultyStub.exists = false;
        expect(await decideWithFaculty(studentsRouter, "post", "/students", ROLES.TEACHER, null)).toBe(403);
        expect(await decideWithFaculty(enrollmentsRouter, "post", "/enrollments", ROLES.TEACHER, null)).toBe(403);
        expect(await decideWithFaculty(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.TEACHER, null)).toBe(403);
    });
});

describe("SF9 report card stays outside the register faculty role", () => {
    it("keeps its ownership-only guard chain (no role restriction was added or removed)", () => {
        // GET /student/:enrollmentId/report-card is authenticated but NOT
        // role-guarded — access is decided per-enrollment in the controller via
        // assertCanAccessEnrollment(). This test pins that chain so the register
        // migration cannot silently widen or narrow it.
        const handlers = findHandlers(
            studentReportCardRouter,
            "get",
            "/student/:enrollmentId/report-card",
        );
        expect(handlers.map((handler) => (handler as { name?: string }).name)).toEqual([
            "ValidateToken",
            "studentReportCardController",
        ]);
    });
});

describe("unauthenticated requests", () => {
    it("are rejected with 401 on register-reachable and admin-only routes alike", async () => {
        expect(await decideWithFaculty(enrollmentsRouter, "post", "/enrollments", undefined as unknown as UserRole, null, inferParams("post", "/enrollments"))).toBe(401);
        expect(await decideWithFaculty(studentsRouter, "post", "/students", undefined as unknown as UserRole, null, inferParams("post", "/students"))).toBe(401);
        expect(await decideWithFaculty(studentsRouter, "get", "/students/not-enrolled", undefined as unknown as UserRole, null, inferParams("get", "/students/not-enrolled"))).toBe(401);
        expect(await decideWithFaculty(studentRecordRouter, "get", "/student-records/:id/pdf", undefined as unknown as UserRole, null, inferParams("get", "/student-records/:id/pdf"))).toBe(401);
        expect(await decideWithFaculty(schoolYearRouter, "post", "/schoolYear", undefined as unknown as UserRole, null, inferParams("post", "/schoolYear"))).toBe(401);
    });
});

describe("faculty-role constant", () => {
    it("defines both teacher and register as faculty roles", () => {
        expect(FACULTY_ROLES.TEACHER).toBe("teacher");
        expect(FACULTY_ROLES.REGISTER).toBe("register");
        expect(new Set(Object.values(FACULTY_ROLES)).size).toBe(Object.keys(FACULTY_ROLES).length);
    });
});
