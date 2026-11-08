import { describe, expect, it } from "vitest";
import { computeAuditDiff } from "../src/helper/auditDiff.js";

describe("computeAuditDiff unit tests", () => {
    it("returns an empty object when before and after objects are identical", () => {
        const state = { score: 95, remarks: "Passed", active: true };
        const diff = computeAuditDiff(state, { ...state });
        expect(diff).toEqual({});
    });

    it("correctly identifies modified properties with old and new values", () => {
        const before = { score: 85, remarks: "Passed" };
        const after = { score: 92, remarks: "Passed" };
        const diff = computeAuditDiff(before, after);

        expect(diff).toEqual({
            score: { old: 85, new: 92 },
        });
    });

    it("handles null and undefined before states (new entity creation)", () => {
        const after = { score: 88, remarks: "Passed" };
        const diff = computeAuditDiff(null, after);

        expect(diff).toEqual({
            score: { old: null, new: 88 },
            remarks: { old: null, new: "Passed" },
        });
    });

    it("handles null and undefined after states (entity deletion)", () => {
        const before = { score: 88, remarks: "Passed" };
        const diff = computeAuditDiff(before, null);

        expect(diff).toEqual({
            score: { old: 88, new: null },
            remarks: { old: "Passed", new: null },
        });
    });

    it("captures new fields added to the after state", () => {
        const before = { score: 85 };
        const after = { score: 85, reason: "Adjustment" };
        const diff = computeAuditDiff(before, after);

        expect(diff).toEqual({
            reason: { old: null, new: "Adjustment" },
        });
    });

    it("captures fields removed in the after state", () => {
        const before = { score: 85, tempNote: "Check with adviser" };
        const after = { score: 85 };
        const diff = computeAuditDiff(before, after);

        expect(diff).toEqual({
            tempNote: { old: "Check with adviser", new: null },
        });
    });
});

