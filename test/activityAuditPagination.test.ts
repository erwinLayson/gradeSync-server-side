import { describe, expect, it, vi, beforeEach } from "vitest";

const { executeMock, releaseMock, getConnectionMock } = vi.hoisted(() => {
  const executeMock = vi.fn();
  const releaseMock = vi.fn();
  const getConnectionMock = vi.fn(async () => ({ execute: executeMock, release: releaseMock }));
  return { executeMock, releaseMock, getConnectionMock };
});

vi.mock("../src/config/database.js", () => ({
  getDBPoolConnection: () => ({ getConnection: getConnectionMock }),
}));

import ActivityAuditModel from "../src/model/activityAudit.js";

const fakeRow = {
  id: 1,
  actorUserId: 1,
  actorName: "Actor",
  actorRole: "teacher",
  actorFacultyId: null,
  action: "grade_submitted",
  description: "A log entry",
  entityType: "gradebook",
  entityId: null,
  schoolYearId: null,
  schoolYear: null,
  classroomId: null,
  classroomName: null,
  gradeLevel: null,
  subjectId: null,
  subjectName: null,
  quarter: null,
  status: "success",
  beforeState: null,
  afterState: null,
  diff: null,
  metadata: null,
  ipAddress: null,
  userAgent: null,
  created_at: "2026-11-08T10:15:30.000Z",
};

function setupFakeDb(total = 2) {
  executeMock.mockImplementation(async (sql: string) => {
    if (/COUNT\(\*\)/i.test(sql)) return [[{ total }]];

    if (sql.includes("LIMIT ?") || sql.includes("OFFSET ?")) {
      const error = Object.assign(new Error("Incorrect arguments to LIMIT"), {
        code: "ER_WRONG_ARGUMENTS",
        errno: 1210,
      });
      throw error;
    }

    return [[fakeRow]];
  });
}

function dataQueryCall() {
  const call = executeMock.mock.calls.find(([sql]) =>
    String(sql).includes("SELECT * FROM activity_audit_logs")
  );
  if (!call) throw new Error("Data query was not executed");
  return { sql: String(call[0]), params: call[1] as unknown[] };
}

describe("ActivityAuditModel.getAuditLogs pagination (TiDB ER_WRONG_ARGUMENTS regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFakeDb();
  });

  it("inlines validated LIMIT/OFFSET numbers instead of string placeholders", async () => {
    const result = await new ActivityAuditModel().getAuditLogs({}, { page: 1, limit: 15 });

    const { sql, params } = dataQueryCall();
    expect(sql).toContain("LIMIT 15 OFFSET 0");
    expect(sql).not.toContain("LIMIT ?");
    expect(params).toEqual([]);
    expect(result).toMatchObject({ total: 2, page: 1, limit: 15, totalPages: 1 });
    expect(result.data[0]).toMatchObject({ id: 1, actorName: "Actor" });
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("computes the correct byte-equivalent OFFSET for later pages", async () => {
    await new ActivityAuditModel().getAuditLogs({}, { page: 3, limit: 15 });

    expect(dataQueryCall().sql).toContain("LIMIT 15 OFFSET 30");
  });

  it("clamps the limit to the allowed 1-100 range before inlining", async () => {
    await new ActivityAuditModel().getAuditLogs({}, { page: 1, limit: 500 });
    expect(dataQueryCall().sql).toContain("LIMIT 100 OFFSET 0");

    executeMock.mockClear();
    await new ActivityAuditModel().getAuditLogs({}, { page: 1, limit: 0 });
    expect(dataQueryCall().sql).toContain("LIMIT 1 OFFSET 0");
  });

  it("falls back to safe numbers for non-finite pagination input", async () => {
    await new ActivityAuditModel().getAuditLogs(
      {},
      { page: Number.NaN, limit: Number.POSITIVE_INFINITY }
    );

    expect(dataQueryCall().sql).toContain("LIMIT 20 OFFSET 0");
  });

  it("keeps user filters parameterized while pagination is inlined", async () => {
    await new ActivityAuditModel().getAuditLogs(
      { actorRole: "teacher", search: "grade" },
      { page: 2, limit: 10 }
    );

    const { sql, params } = dataQueryCall();
    expect(sql).toContain("LIMIT 10 OFFSET 10");
    expect(params).toEqual(["teacher", "%grade%", "%grade%", "%grade%"]);
  });
});
