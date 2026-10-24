import { describe, expect, it } from "vitest";

import { HTMLRenderer } from "../src/helper/HTMLRenderer.js";

/**
 * The school head signature is injected into the SF10 (student permanent
 * record) and SF9 (report card) templates as a self-contained data URL, so
 * Puppeteer can render it without any network/auth. These tests render the
 * real EJS templates and assert the image appears above each printed
 * principal/school-head name — and is omitted when no signature is saved.
 */

const SIGNATURE_DATA_URL = "data:image/png;base64,SIGNATURE_SENTINEL";
const LOGO_DATA_URL = "data:image/png;base64,LOGO_SENTINEL";

function countSignatureImages(html: string): number {
    return html.split('class="school-head-signature-image"').length - 1;
}

function sf10Data(signature: string | null) {
    const record = {
        classGradeLevel: 7,
        classSection: "A",
        schoolYear: "2025-2026",
        adviserName: "Adviser Name",
        generalAverage: 90,
        subjects: [],
    };
    return {
        numQuarters: 4,
        student: { lastname: "Doe", firstname: "John", suffix: null, middlename: "Reyes" },
        scholastic: { semester1: [record], semester2: [record] },
        schoolInfo: { name: "Test School", schoolId: "123456", district: "District", region: "Region" },
        certification: {
            studentName: "John Reyes Doe",
            studentLrn: "123456789012",
            admission_to: 7,
            schoolName: "Test School",
            schoolId: "123456",
            date: "01/01/26",
            schoolPrincipal: "Jane Principal",
            lastSchoolYear: "2025-2026",
        },
        signature,
    };
}

function sf9Data(signature: string | null, logo: string | null = null) {
    return {
        numQuarters: 4,
        student: {
            studentLrn: "123456789012",
            studentFullName: "John Reyes Doe",
            studentAge: 13,
            studentSex: "Male",
            classGradeLevel: 7,
            classSection: "A",
            schoolYear: "2025-2026",
            classAdviser: "Adviser Name",
        },
        schoolInfo: {
            region: "Region",
            division: "Division",
            name: "Test School",
            schoolId: "123456",
            address: "Address",
            principal: "Jane Principal",
        },
        subjects: [],
        generalAverages: { score: 90, remarks: "Passed" },
        attendance: [],
        signature,
        logo,
    };
}

describe("PDF school-head signature rendering", () => {
    it("renders the signature as an absolutely-positioned overlay in both SF10 certification pages", () => {
        const html = HTMLRenderer("studentRecord.ejs", sf10Data(SIGNATURE_DATA_URL));

        expect(countSignatureImages(html)).toBe(2);
        expect(html.match(new RegExp(`src="${SIGNATURE_DATA_URL}"`, "g"))?.length).toBe(2);
        // The positioning container must be present and the image must be out of flow.
        expect(html.match(/class="grid school-head-signature-area"/g)?.length).toBe(2);
        expect(html).toContain("position: absolute");
    });

    it("keeps the SF10 containers but omits the image when none is saved", () => {
        const html = HTMLRenderer("studentRecord.ejs", sf10Data(null));

        expect(countSignatureImages(html)).toBe(0);
        expect(html.match(/class="grid school-head-signature-area"/g)?.length).toBe(2);
        expect(html).not.toContain("SIGNATURE_SENTINEL");
        expect(html).not.toContain('src="data:image');
    });

    it("renders the signature in all three SF9 school-head blocks", () => {
        const html = HTMLRenderer("studentCard.ejs", sf9Data(SIGNATURE_DATA_URL));

        expect(countSignatureImages(html)).toBe(3);
        expect(html.match(new RegExp(`src="${SIGNATURE_DATA_URL}"`, "g"))?.length).toBe(3);
        expect(html.match(/class="[^"]*school-head-signature-area"/g)?.length).toBe(3);
        expect(html).toContain("position: absolute");
    });

    it("keeps the SF9 containers but omits the image when none is saved", () => {
        const html = HTMLRenderer("studentCard.ejs", sf9Data(null));

        expect(countSignatureImages(html)).toBe(0);
        expect(html.match(/class="[^"]*school-head-signature-area"/g)?.length).toBe(3);
        expect(html).not.toContain("SIGNATURE_SENTINEL");
        expect(html).not.toContain('src="data:image');
    });

    it("renders the uploaded school logo in the SF9 header", () => {
        const html = HTMLRenderer("studentCard.ejs", sf9Data(null, LOGO_DATA_URL));

        expect(html).toContain(`src="${LOGO_DATA_URL}"`);
        expect(html).toContain('alt="School logo"');
    });
});
