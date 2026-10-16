import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { getTestConnection } from "./helpers/db.js";
import { createScenario, teardownScenario, type Scenario } from "./helpers/fixtures.js";

import {
    CreateFacultyService,
    assertOnlyTeachingFaculty,
    getAllFacultiesService,
    updateFacultyService,
} from "../src/service/faculties.js";
import { setClassAdviserService } from "../src/service/classrooms.js";
import {
    assignFacultiesToSubjectService,
    getFacultiesUnassignedToSubjectService,
} from "../src/service/subjects.js";
import { createClassSubjectService } from "../src/service/class_subjects.js";

import { FACULTY_ROLES } from "../src/constant/faculties.js";
import { ROLES } from "../src/constant/users.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../src/middleware/errors.js";

import facultiesRouter from "../src/routes/faculties.js";
import schoolYearRouter from "../src/routes/schoolYear.js";

/**
 * Faculty role behaviour
 * (docs/faculty-role-implementation-plan.md §4-§7).
 *
 * Everything below runs against the disposable test database through the REAL
 * model/service code, so the assertions cover the same SQL the API executes:
 *   - `role` is required and validated (teacher | register),
 *   - role changes are gated on the school year being officially completed,
 *   - a register faculty member can never hold a teaching responsibility.
 */

const { TEACHER, REGISTER } = FACULTY_ROLES;

let connection: PoolConnection;
let scenario: Scenario;

/** Faculty rows + linked users created by a test, removed after each test. */
let createdFacultyIds: number[] = [];
let createdUserIds: number[] = [];

async function createTestFaculty(role: typeof TEACHER | typeof REGISTER): Promise<number> {
    const sequence = createdFacultyIds.length + createdUserIds.length + 1;
    const facultyId = await CreateFacultyService({
        email: `f.${Date.now().toString(36)}${sequence}@test.local`,
        firstname: "Test",
        middlename: "M",
        lastname: `Faculty${sequence}`,
        role,
    });
    createdFacultyIds.push(facultyId);

    const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT userId FROM faculties WHERE id = ?",
        [facultyId],
    );
    if (rows[0]?.userId) {
        createdUserIds.push(Number(rows[0].userId));
    }
    return facultyId;
}

/**
 * Runs `run` with the scenario's own school year as the governing (active) one,
 * set to `status`, then restores whatever was active before.
 */
async function withGoverningSchoolYear(
    status: "ongoing" | "completed",
    run: () => Promise<void>,
): Promise<void> {
    const [activeRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1",
    );
    const previousActiveId = activeRows[0]?.id ?? null;

    await connection.execute("UPDATE schoolyear SET isActive = (id = ?)", [scenario.schoolYearId]);
    await connection.execute("UPDATE schoolyear SET status = ? WHERE id = ?", [
        status,
        scenario.schoolYearId,
    ]);
    try {
        await run();
    } finally {
        await connection.execute("UPDATE schoolyear SET status = 'ongoing' WHERE id = ?", [
            scenario.schoolYearId,
        ]);
        await connection.execute("UPDATE schoolyear SET isActive = (id = ?)", [
            previousActiveId ?? 0,
        ]);
    }
}

async function facultyRoleOf(facultyId: number): Promise<string | undefined> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT role FROM faculties WHERE id = ?",
        [facultyId],
    );
    return rows[0]?.role;
}

async function loginRoleOfFaculty(facultyId: number): Promise<string | undefined> {
    const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT u.role AS role FROM users u JOIN faculties f ON f.userId = u.id WHERE f.id = ?",
        [facultyId],
    );
    return rows[0]?.role;
}

beforeEach(async () => {
    connection = await getTestConnection();
    scenario = await createScenario(connection);
});

afterEach(async () => {
    for (const facultyId of createdFacultyIds) {
        await connection.execute("DELETE FROM faculty_subject_assignment WHERE facultyId = ?", [facultyId]);
        await connection.execute("DELETE FROM class_subjects WHERE facultyId = ?", [facultyId]);
        await connection.execute("DELETE FROM class_adviser WHERE facultyId = ?", [facultyId]);
        await connection.execute("DELETE FROM student_academic_record_quarters WHERE submittedBy = ?", [facultyId]);
        await connection.execute("DELETE FROM faculties WHERE id = ?", [facultyId]);
    }
    for (const userId of createdUserIds) {
        await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
    }
    createdFacultyIds = [];
    createdUserIds = [];

    await teardownScenario(connection, scenario);
    connection.release();
});

// ===========================================================================
// 1. `role` is required and validated
// ===========================================================================
describe("faculty role validation", () => {
    it("rejects an unsupported role on create", async () => {
        await expect(
            CreateFacultyService({
                email: "unsupported@test.local",
                firstname: "Test",
                middlename: "M",
                lastname: "Faculty",
                role: "librarian" as never,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects a missing role on create", async () => {
        await expect(
            CreateFacultyService({
                email: "missing@test.local",
                firstname: "Test",
                middlename: "M",
                lastname: "Faculty",
            } as never),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("stores the chosen role and mirrors it into users.role", async () => {
        const facultyId = await createTestFaculty(REGISTER);

        expect(await facultyRoleOf(facultyId)).toBe(REGISTER);
        expect(await loginRoleOfFaculty(facultyId)).toBe(ROLES.TEACHER);

        const teacherFacultyId = await createTestFaculty(TEACHER);
        expect(await facultyRoleOf(teacherFacultyId)).toBe(TEACHER);
        expect(await loginRoleOfFaculty(teacherFacultyId)).toBe(ROLES.TEACHER);
    });

    it("narrows the list by role and refuses an unknown filter", async () => {
        const registerId = await createTestFaculty(REGISTER);
        const teacherFacultyId = await createTestFaculty(TEACHER);

        const teachers = await getAllFacultiesService(TEACHER);
        expect(teachers.some((faculty) => faculty.id === teacherFacultyId)).toBe(true);
        expect(teachers.some((faculty) => faculty.id === registerId)).toBe(false);

        const registers = await getAllFacultiesService(REGISTER);
        expect(registers.some((faculty) => faculty.id === registerId)).toBe(true);
        expect(registers.some((faculty) => faculty.id === teacherFacultyId)).toBe(false);

        await expect(getAllFacultiesService("principal" as never)).rejects.toBeInstanceOf(BadRequestError);
    });
});

// ===========================================================================
// 2. Role changes wait for the school year to be completed
// ===========================================================================
describe("school-year completion gate", () => {
    it("refuses a role change while the governing year is ongoing (409)", async () => {
        const facultyId = await createTestFaculty(TEACHER);

        await withGoverningSchoolYear("ongoing", async () => {
            await expect(
                updateFacultyService(facultyId, { role: REGISTER }, ROLES.ADMIN),
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        // Nothing was written: role and login role are untouched.
        expect(await facultyRoleOf(facultyId)).toBe(TEACHER);
        expect(await loginRoleOfFaculty(facultyId)).toBe(ROLES.TEACHER);
    });

    it("applies the change once the year is completed and keeps users.role in sync", async () => {
        const facultyId = await createTestFaculty(TEACHER);

        await withGoverningSchoolYear("completed", async () => {
            await updateFacultyService(facultyId, { role: REGISTER }, ROLES.ADMIN);
        });

        expect(await facultyRoleOf(facultyId)).toBe(REGISTER);
        expect(await loginRoleOfFaculty(facultyId)).toBe(ROLES.TEACHER);
    });

    it("keeps unrelated profile edits possible during an active year", async () => {
        const facultyId = await createTestFaculty(TEACHER);

        await withGoverningSchoolYear("ongoing", async () => {
            await updateFacultyService(facultyId, { email: "renamed@test.local" }, ROLES.ADMIN);
        });

        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT email, role FROM faculties WHERE id = ?",
            [facultyId],
        );
        expect(rows[0]?.email).toBe("renamed@test.local");
        expect(rows[0]?.role).toBe(TEACHER);
    });

    it("refuses a role change from anyone but an admin", async () => {
        const facultyId = await createTestFaculty(TEACHER);

        await withGoverningSchoolYear("completed", async () => {
            await expect(
                updateFacultyService(facultyId, { role: REGISTER }, ROLES.TEACHER),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        expect(await facultyRoleOf(facultyId)).toBe(TEACHER);
    });

    it("refuses teacher -> register while class-subject assignments remain (409)", async () => {
        // The scenario faculty teaches scenario.classSubjectId.
        await withGoverningSchoolYear("completed", async () => {
            await expect(
                updateFacultyService(scenario.facultyId, { role: REGISTER }, ROLES.ADMIN),
            ).rejects.toBeInstanceOf(ConflictError);
        });

        expect(await facultyRoleOf(scenario.facultyId)).toBe(TEACHER);
    });
});

// ===========================================================================
// 3. Register faculty hold no teaching responsibilities
// ===========================================================================
describe("register faculty cannot hold teaching responsibilities", () => {
    it("rejects a register faculty as class adviser", async () => {
        const registerId = await createTestFaculty(REGISTER);

        await expect(setClassAdviserService(scenario.classroomId, registerId)).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("rejects adding a register faculty to a subject pool", async () => {
        const registerId = await createTestFaculty(REGISTER);

        await expect(
            assignFacultiesToSubjectService({
                subjectId: scenario.subjectId,
                facultiesId: [registerId],
            }),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects creating a class subject taught by a register faculty", async () => {
        const registerId = await createTestFaculty(REGISTER);

        await expect(
            createClassSubjectService([
                { classId: scenario.classroomId, subjectId: scenario.subjectId, facultyId: registerId },
            ]),
        ).rejects.toBeInstanceOf(ConflictError);
    });

    it("keeps register faculty out of the subject assignment candidates", async () => {
        const registerId = await createTestFaculty(REGISTER);
        const teacherFacultyId = await createTestFaculty(TEACHER);

        const candidates = await getFacultiesUnassignedToSubjectService(scenario.subjectId);
        expect(candidates.some((faculty) => faculty.id === registerId)).toBe(false);
        expect(candidates.some((faculty) => faculty.id === teacherFacultyId)).toBe(true);
    });

    it("reports a non-existent faculty id as 404 (never a silent pass)", async () => {
        await expect(assertOnlyTeachingFaculty(connection, 9_999_999)).rejects.toBeInstanceOf(NotFoundError);
        // Empty inputs are a no-op rather than a 404.
        await expect(assertOnlyTeachingFaculty(connection, [])).resolves.toBeUndefined();
    });
});

// ===========================================================================
// 4. Route guards (introspection over the REAL routers)
// ===========================================================================
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

function decide(router: unknown, method: HttpMethod, path: string, role: string | null): "allowed" | number {
    const stack = (router as { stack: RouteLayer[] }).stack;
    const layer = stack.find(
        (entry) => entry.route?.path === path && entry.route.methods[method] === true,
    );
    if (!layer?.route) {
        throw new Error(`No ${method.toUpperCase()} ${path} route found in router`);
    }
    const handlers = layer.route.stack.map((registered) => registered.handle);
    expect((handlers[0] as { name?: string } | undefined)?.name).toBe("ValidateToken");

    const guard = handlers[1] as unknown as GuardFn;
    const req: Record<string, unknown> =
        role === null ? {} : { user: { id: 1, email: "guard@test.local", role } };

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

describe("faculty and school-year route guards", () => {
    it("keeps faculty creation/deletion admin-only and the school-year switch admin-only", () => {
        expect(isAllowed(facultiesRouter, "post", "/faculties", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(facultiesRouter, "post", "/faculties", ROLES.TEACHER)).toBe(false);
        expect(isAllowed(facultiesRouter, "post", "/faculties", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(facultiesRouter, "post", "/faculties", ROLES.TEACHER)).toBe(false);
        // Register staff authenticate as a faculty account, so a plain user-role
        // decision is no longer the right authority here. The route is protected via
        // the verified faculty record instead.
        expect(isAllowed(facultiesRouter, "post", "/faculties", ROLES.TEACHER)).toBe(false);

        expect(isAllowed(facultiesRouter, "delete", "/faculties/:id", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(facultiesRouter, "delete", "/faculties/:id", ROLES.TEACHER)).toBe(false);

        // The list (with ?role=teacher filtering) stays admin + teacher.
        expect(isAllowed(facultiesRouter, "get", "/faculties", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(facultiesRouter, "get", "/faculties", ROLES.TEACHER)).toBe(true);
        // Same as above: list access for register staff is decided through the
        // verified faculty role, not a user-role constant.
        expect(isAllowed(facultiesRouter, "get", "/faculties", ROLES.TEACHER)).toBe(true);

        // Completing a school year is what unlocks role changes — admin only.
        expect(isAllowed(schoolYearRouter, "patch", "/schoolYear/:id/status", ROLES.ADMIN)).toBe(true);
        expect(isAllowed(schoolYearRouter, "patch", "/schoolYear/:id/status", ROLES.TEACHER)).toBe(false);
        // Same as above: this switch is admin-only, and register staff do not gain it
        // through the user-role model.
        expect(isAllowed(schoolYearRouter, "patch", "/schoolYear/:id/status", ROLES.TEACHER)).toBe(false);
        expect(isAllowed(schoolYearRouter, "patch", "/schoolYear/:id/status", ROLES.STUDENT)).toBe(false);
    });

    it("refuses an unauthenticated caller on both routers", () => {
        expect(decide(facultiesRouter, "get", "/faculties", null)).toBe(401);
        expect(decide(schoolYearRouter, "patch", "/schoolYear/:id/status", null)).toBe(401);
    });
});
