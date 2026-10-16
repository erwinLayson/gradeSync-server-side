import { describe, expect, it } from "vitest";

import {
    classifyQuarterTransition,
    getQuarterArray,
    isValidQuarter,
    MAX_QUARTERS,
    MIN_QUARTERS,
    parseQuarterInput,
} from "../src/helper/quarterValidation.js";

/**
 * The academic-settings endpoint must reject nonsense quarter values instead of
 * coercing them. `Number()` alone would turn `true` into 1, `""` into 0 and
 * `[2]` into 2 — i.e. accept garbage as a valid quarter — so parsing has its own
 * explicit rules (see parseQuarterInput).
 */
describe("parseQuarterInput (strict — no silent coercion)", () => {
    it("accepts whole numbers and strings of digits", () => {
        expect(parseQuarterInput(1)).toBe(1);
        expect(parseQuarterInput(4)).toBe(4);
        expect(parseQuarterInput(0)).toBe(0);
        expect(parseQuarterInput(-1)).toBe(-1);
        expect(parseQuarterInput("2")).toBe(2);
        expect(parseQuarterInput("  3  ")).toBe(3);
    });

    it("rejects anything that is not a whole number or a digit string", () => {
        const rejected: unknown[] = [
            true,
            false,
            null,
            undefined,
            "",
            "   ",
            "two",
            "Q2",
            "2.5",
            [2],
            { currentQuarter: 2 },
            NaN,
            Infinity,
            -Infinity,
        ];

        for (const value of rejected) {
            expect(parseQuarterInput(value), `parseQuarterInput(${JSON.stringify(value) ?? String(value)})`).toBeNull();
        }
    });

    it("rejects fractional numbers", () => {
        expect(parseQuarterInput(2.5)).toBeNull();
        expect(parseQuarterInput(3.0000001)).toBeNull();
    });
});

describe("isValidQuarter (range against the configured number of quarters)", () => {
    it("accepts 1..numQuarters for a 4-quarter school", () => {
        expect([1, 2, 3, 4].every((q) => isValidQuarter(q, MAX_QUARTERS))).toBe(true);
    });

    it("accepts 1..numQuarters for a 3-quarter school", () => {
        expect([1, 2, 3].every((q) => isValidQuarter(q, MIN_QUARTERS))).toBe(true);
        // The configured bound — not the system maximum — is what counts.
        expect(isValidQuarter(4, MIN_QUARTERS)).toBe(false);
    });

    it("rejects zero, negatives, fractions and NaN", () => {
        for (const quarter of [0, -1, 2.5, NaN, Infinity]) {
            expect(isValidQuarter(quarter, MAX_QUARTERS), `isValidQuarter(${quarter}, 4)`).toBe(false);
        }
    });
});

describe("classifyQuarterTransition", () => {
    it("classifies one quarter forward as an advance", () => {
        expect(classifyQuarterTransition(1, 2)).toBe("advance");
        expect(classifyQuarterTransition(3, 4)).toBe("advance");
    });

    it("classifies a repeat as a no-op", () => {
        expect(classifyQuarterTransition(2, 2)).toBe("same");
    });

    it("classifies a jump over an intermediate quarter as a skip", () => {
        expect(classifyQuarterTransition(1, 3)).toBe("skip");
        expect(classifyQuarterTransition(1, 4)).toBe("skip");
        expect(classifyQuarterTransition(2, 4)).toBe("skip");
    });

    it("classifies any lower quarter as a rewind (deliberate correction)", () => {
        expect(classifyQuarterTransition(2, 1)).toBe("rewind");
        expect(classifyQuarterTransition(4, 1)).toBe("rewind");
    });
});

describe("getQuarterArray", () => {
    it("returns the configured grading periods", () => {
        expect(getQuarterArray(MIN_QUARTERS)).toEqual([1, 2, 3]);
        expect(getQuarterArray(MAX_QUARTERS)).toEqual([1, 2, 3, 4]);
    });
});
