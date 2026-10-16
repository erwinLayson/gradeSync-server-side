import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import getEnv from "../src/helper/getEnv.js";

import enrollmentsRouter from "../src/routes/enrollments.js";
import studentsRouter from "../src/routes/students.js";
import studentRecordRouter from "../src/routes/studentRecord.js";
import studentReportCardRouter from "../src/routes/studentReportCard.js";
import schoolYearRouter from "../src/routes/schoolYear.js";
import academicSettingsRouter from "../src/routes/academicSettings.js";
import classroomsRouter from "../src/routes/classrooms.js";
import usersRouter from "../src/routes/users.js";

import { ROLES } from "../src/constant/users.js";

/**
 * Register-role authorization matrix
 * (docs/register-role-implementation-plan.md §6.2/§6.3, §13.5).
 *
 * This exercises the REAL route registration: it walks each Express router's
 * stack, finds the route, and runs the `allowedRoles` guard that the route was
 * registered with. If someone removes `ROLES.REGISTER` from a route (or adds it
 * to an Admin-only route), the matching expectation below fails.
 *
 * The `ValidateToken` layer is intentionally not executed — the guard is called
 * directly with a synthetic `req.user`, so the test stays free of JWT/DB setup
 * and isolates the authorization decision under test.
 */

type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

interface RouteLayer {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: unknown }[];
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

/**
 * The route's role guard. Every guarded route in this codebase is registered as
 * `[ValidateToken, allowedRoles([...]), controller]`, so the guard is the second
 * handler. The first handler's name is asserted so the positional assumption is
 * explicit and cannot silently drift.
 */
function roleGuard(router: unknown, method: HttpMethod, path: string): GuardFn {
    const handlers = findHandlers(router, method, path);
    expect(
        (handlers[0] as { name?: string } | undefined)?.name,
        `${routeLabel(method, path)}: expected ValidateToken first`,
    ).toBe("ValidateToken");
    expect(
        handlers.length,
        `${routeLabel(method, path)}: expected a ValidateToken + role guard + controller chain`,
    ).toBeGreaterThanOrEqual(3);

    const guard = handlers[1] as { name?: string } | undefined;
    // allowedRoles() returns an anonymous function; the named controller sits last.
    expect(guard?.name, `${routeLabel(method, path)}: expected role guard second`).toBe("");
    return guard as unknown as GuardFn;
}

/** Runs the route's role guard and reports the authorization decision. */
function decide(
    router: unknown,
    method: HttpMethod,
    path: string,
    role: string | null,
): "allowed" | number {
    const guard = roleGuard(router, method, path);
    const req: Record<string, unknown> =
        role === null ? {} : { user: { id: 1, email: "t@test.local", role } };

    let nextCalled = false;
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

    guard(req, res, () => {
        nextCalled = true;
    });

    return nextCalled ? "allowed" : res.statusCode;
}

function isAllowed(router: unknown, method: HttpMethod, path: string, role: string): boolean {
    return decide(router, method, path, role) === "allowed";
}

// ==================== the authorization matrix ====================

type AllowedCase = [label: string, router: unknown, method: HttpMethod, path: string];
/** `adminAllowed` is false for routes Admin is not on either (e.g. dev-only). */
type DeniedCase = [label: string, router: unknown, method: HttpMethod, path: string, adminAllowed: boolean];

/** Endpoints Register shares with Admin (registration work). */
const REGISTER_ALLOWED: AllowedCase[] = [
    ["enroll a student", enrollmentsRouter, "post", "/enrollments"],
    ["create a student + login", studentsRouter, "post", "/students"],
    ["list all students", studentsRouter, "get", "/students"],
    ["search not-yet-enrolled students", studentsRouter, "get", "/students/not-enrolled"],
    ["read student detail", studentsRouter, "get", "/students/:id/students"],
    ["read student academic history", studentsRouter, "get", "/students/:id/academic-history"],
    // Register owns the student registry (docs/register-role-implementation-plan.md
    // §17.7 decision): it edits and soft-deletes student records.
    ["edit a student", studentsRouter, "patch", "/students/:id"],
    ["soft-delete a student", studentsRouter, "delete", "/students/:id"],
    ["list classrooms", classroomsRouter, "get", "/classrooms"],
    ["read a classroom's subjects", classroomsRouter, "get", "/classrooms/:classroomId/teachers-subject"],
    ["read school years", schoolYearRouter, "get", "/schoolYear"],
    ["read academic settings", academicSettingsRouter, "get", "/academic-settings"],
    ["print SF10 / Form-137", studentRecordRouter, "get", "/student-records/:id/pdf"],
    // Every role manages its OWN login credentials; the controller enforces
    // "own account or admin".
    ["update its own email/password", usersRouter, "put", "/users/:id"],
];

/** Endpoints Register must NOT reach (Admin-only or other-role-only). */
const REGISTER_DENIED: DeniedCase[] = [
    // Destructive / management enrollment actions stay Admin-only.
    ["enrollment active-count", enrollmentsRouter, "get", "/enrollments/active-count", true],
    ["bulk-remove a classroom's enrollments", enrollmentsRouter, "delete", "/classrooms/:classId/enrollments", true],
    ["clear a classroom", enrollmentsRouter, "delete", "/classrooms/:classId/enrollments/clear", true],
    ["clear all classrooms", enrollmentsRouter, "delete", "/enrollments/clear-all", true],
    // The curated past-submitted-grades view stays Admin-only.
    ["read past submitted grades", studentsRouter, "get", "/students/:id/past-submitted-grades", true],
    // Submission tracker summary.
    ["submission summary", studentRecordRouter, "get", "/student-records/summary", true],
    // School-year + academic-settings management.
    ["create a school year", schoolYearRouter, "post", "/schoolYear", true],
    ["activate a school year", schoolYearRouter, "patch", "/schoolYear/:id/activate", true],
    ["change academic settings", academicSettingsRouter, "patch", "/academic-settings", true],
    // Classroom management.
    ["create a classroom", classroomsRouter, "post", "/classrooms", true],
    ["update a classroom", classroomsRouter, "put", "/classrooms/:id", true],
    ["archive a classroom", classroomsRouter, "delete", "/classrooms/:id", true],
    ["set a class adviser", classroomsRouter, "put", "/classrooms/:id/adviser", true],
    // Other-role-only routes must not leak to Register.
    ["read the student self-service profile", studentsRouter, "get", "/students/details", false],
    ["read the adviser's own class records", studentRecordRouter, "get", "/student-records/my-class", false],
    // User/account administration: reads are Admin+Developer, mutations are
    // Developer-only. Register may only touch its OWN credentials (the PUT case
    // in the allowed list above).
    ["list all user accounts", usersRouter, "get", "/users", true],
    ["create a user account", usersRouter, "post", "/users", true],
    ["change another account's status", usersRouter, "patch", "/users/:id/status", false],
    ["change another account's role", usersRouter, "patch", "/users/:id/role", false],
    ["reset another account's password", usersRouter, "post", "/users/:id/reset-password", false],
];

describe("Register role authorization", () => {
    it.each(REGISTER_ALLOWED)("allows Register to %s", (_label, router, method, path) => {
        expect(isAllowed(router, method, path, ROLES.REGISTER)).toBe(true);
    });

    it.each(REGISTER_DENIED)("denies Register access to %s", (_label, router, method, path) => {
        // 403 Forbidden (authenticated, wrong role) — never a pass-through.
        expect(decide(router, method, path, ROLES.REGISTER)).toBe(403);
    });
});

describe("existing roles are unchanged", () => {
    it("Admin retains the shared enrollment, student-creation, and SF10 routes", () => {
        expect(isAllowed(enrollmentsRouter, "post", "/enrollments", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "post", "/students", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "get", "/students/not-enrolled", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "get", "/students", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "patch", "/students/:id", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "delete", "/students/:id", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "get", "/students/:id/students", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentsRouter, "get", "/students/:id/academic-history", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(classroomsRouter, "get", "/classrooms", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(schoolYearRouter, "get", "/schoolYear", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(academicSettingsRouter, "get", "/academic-settings", ROLES.ADMIN)).toBe(true);
    });

    it("Admin keeps every route it held before the Register transfer", () => {
        for (const [, router, method, path, adminAllowed] of REGISTER_DENIED) {
            if (!adminAllowed) continue;
            expect(isAllowed(router, method, path, ROLES.ADMIN), routeLabel(method, path)).toBe(true);
        }
    });

    it("Teacher still reads student detail/history and classrooms but cannot enroll or manage records", () => {
        expect(isAllowed(studentsRouter, "get", "/students/:id/students", ROLES.TEACHER)).toBe(true);
        expect(isAllowed(studentsRouter, "get", "/students/:id/academic-history", ROLES.TEACHER)).toBe(true);
        expect(isAllowed(classroomsRouter, "get", "/classrooms", ROLES.TEACHER)).toBe(true);
        expect(decide(enrollmentsRouter, "post", "/enrollments", ROLES.TEACHER)).toBe(403);
        expect(decide(studentsRouter, "post", "/students", ROLES.TEACHER)).toBe(403);
        // Register's widened student access must NOT leak to Teacher.
        expect(decide(studentsRouter, "patch", "/students/:id", ROLES.TEACHER)).toBe(403);
        expect(decide(studentsRouter, "delete", "/students/:id", ROLES.TEACHER)).toBe(403);
    });

    it("Teacher cannot generate the SF10 PDF", () => {
        expect(decide(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.TEACHER)).toBe(403);
    });

    it("Student cannot enroll, create, list, edit or delete students, or print SF10", () => {
        expect(decide(enrollmentsRouter, "post", "/enrollments", ROLES.STUDENT)).toBe(403);
        expect(decide(studentsRouter, "post", "/students", ROLES.STUDENT)).toBe(403);
        expect(decide(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.STUDENT)).toBe(403);
        expect(decide(studentsRouter, "get", "/students/not-enrolled", ROLES.STUDENT)).toBe(403);
        expect(decide(studentsRouter, "get", "/students", ROLES.STUDENT)).toBe(403);
        expect(decide(studentsRouter, "patch", "/students/:id", ROLES.STUDENT)).toBe(403);
        expect(decide(studentsRouter, "delete", "/students/:id", ROLES.STUDENT)).toBe(403);
    });
});

describe("SF9 report card stays outside the Register role", () => {
    it("keeps its ownership-only guard chain (no role restriction was added or removed)", () => {
        // GET /student/:enrollmentId/report-card is authenticated but NOT
        // role-guarded — access is decided per-enrollment in the controller via
        // assertCanAccessEnrollment(). This test pins that chain so the Register
        // transfer cannot silently widen or narrow it.
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
    it("are rejected with 401 on Register-reachable and Admin-only routes alike", () => {
        expect(decide(enrollmentsRouter, "post", "/enrollments", null)).toBe(401);
        expect(decide(studentsRouter, "post", "/students", null)).toBe(401);
        expect(decide(studentsRouter, "get", "/students/not-enrolled", null)).toBe(401);
        expect(decide(studentRecordRouter, "get", "/student-records/:id/pdf", null)).toBe(401);
        expect(decide(schoolYearRouter, "post", "/schoolYear", null)).toBe(401);
    });
});

describe("full middleware chain (ValidateToken + role guard)", () => {
    /** Runs the guarded chain, stopping before the controller. */
    function runChain(router: unknown, method: HttpMethod, path: string, role: string): "reached-controller" | number {
        const handlers = findHandlers(router, method, path);
        // handlers[0] = ValidateToken, handlers[1] = role guard, last = controller.
        const chain = handlers.slice(0, handlers.length - 1);
        const token = jwt.sign({ id: 1, email: "r@test.local", role }, getEnv("JWT_SECRET"));

        const req: Record<string, unknown> = {
            cookies: { login_token: token },
            headers: {},
            params: {},
            query: {},
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

        for (const handler of chain) {
            let nextCalled = false;
            (handler as GuardFn)(req, res, () => {
                nextCalled = true;
            });
            if (!nextCalled) return res.statusCode;
        }

        return "reached-controller";
    }

    it("lets a Register session through to the enroll, student-registry and SF10 controllers", () => {
        expect(runChain(enrollmentsRouter, "post", "/enrollments", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentsRouter, "post", "/students", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentsRouter, "get", "/students", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentsRouter, "patch", "/students/:id", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentsRouter, "delete", "/students/:id", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentRecordRouter, "get", "/student-records/:id/pdf", ROLES.REGISTER)).toBe("reached-controller");
        expect(runChain(studentsRouter, "get", "/students/:id/academic-history", ROLES.REGISTER)).toBe("reached-controller");
    });

    it("stops a Register session at the role guard on Admin-only routes", () => {
        expect(runChain(schoolYearRouter, "post", "/schoolYear", ROLES.REGISTER)).toBe(403);
        expect(runChain(academicSettingsRouter, "patch", "/academic-settings", ROLES.REGISTER)).toBe(403);
        expect(runChain(enrollmentsRouter, "delete", "/enrollments/clear-all", ROLES.REGISTER)).toBe(403);
    });

    it("rejects a tampered/absent token with 401 before the role guard runs", () => {
        const handlers = findHandlers(enrollmentsRouter, "post", "/enrollments");
        const validateToken = handlers[0] as GuardFn;
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
        let nextCalled = false;
        validateToken({ cookies: { login_token: "not-a-jwt" } }, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });
});

describe("Register role constant", () => {
    it("is defined and distinct from the existing roles", () => {
        expect(ROLES.REGISTER).toBe("register");
        expect(ROLES.ADMIN).toBe("admin");
        expect(ROLES.TEACHER).toBe("teacher");
        expect(ROLES.STUDENT).toBe("student");
        expect(ROLES.DEVELOPER).toBe("developer");
        expect(new Set(Object.values(ROLES)).size).toBe(Object.keys(ROLES).length);
    });
});
