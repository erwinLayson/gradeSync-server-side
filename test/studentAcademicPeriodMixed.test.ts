import { describe, expect, it } from "vitest";
import { HTMLRenderer } from "../src/helper/HTMLRenderer.js";
import { determineRecordNumQuarters } from "../src/service/studentRecord.js";
import type { QuarterSubmissionRow, StudentAcademicRecordSubjectRow } from "../src/constant/studentRecord.js";

describe("Mixed academic periods across school years (SF10 & Academic History)", () => {
    describe("determineRecordNumQuarters", () => {
        it("identifies a historical record with only 3 quarters as 3 quarters", () => {
            const enrollment = { schoolYearId: 10, isActive: 0 };
            const subjectRows: StudentAcademicRecordSubjectRow[] = [
                {
                    id: 1,
                    recordId: 1,
                    subjectName: "English",
                    subjectCode: "ENG",
                    q1: 85,
                    q2: 88,
                    q3: 90,
                    q4: null
                }
            ];
            const submissions: QuarterSubmissionRow[] = [
                { id: 1, recordId: 1, quarter: 1, status: "submitted", submittedAt: null, submittedBy: null },
                { id: 2, recordId: 1, quarter: 2, status: "submitted", submittedAt: null, submittedBy: null },
                { id: 3, recordId: 1, quarter: 3, status: "submitted", submittedAt: null, submittedBy: null }
            ];
            const schoolYearsWithQ4 = new Set<number>([11]); // School year 10 has no Q4 anywhere

            const nq = determineRecordNumQuarters(
                enrollment,
                subjectRows,
                submissions,
                schoolYearsWithQ4,
                4 // current setting is 4
            );

            expect(nq).toBe(3);
        });

        it("identifies a record with Q4 grade as 4 quarters even in historical year", () => {
            const enrollment = { schoolYearId: 9, isActive: 0 };
            const subjectRows: StudentAcademicRecordSubjectRow[] = [
                {
                    id: 1,
                    recordId: 2,
                    subjectName: "Math",
                    subjectCode: "MATH",
                    q1: 85,
                    q2: 88,
                    q3: 90,
                    q4: 92
                }
            ];
            const submissions: QuarterSubmissionRow[] = [];
            const schoolYearsWithQ4 = new Set<number>();

            const nq = determineRecordNumQuarters(
                enrollment,
                subjectRows,
                submissions,
                schoolYearsWithQ4,
                3 // even if current setting is 3
            );

            expect(nq).toBe(4);
        });

        it("identifies the active school year according to currentNumQuarters", () => {
            const enrollment = { schoolYearId: 12, isActive: 1 };
            const subjectRows: StudentAcademicRecordSubjectRow[] = [];
            const submissions: QuarterSubmissionRow[] = [];
            const schoolYearsWithQ4 = new Set<number>();

            expect(determineRecordNumQuarters(enrollment, subjectRows, submissions, schoolYearsWithQ4, 4)).toBe(4);
            expect(determineRecordNumQuarters(enrollment, subjectRows, submissions, schoolYearsWithQ4, 3)).toBe(3);
        });
    });

    describe("SF10 PDF template HTML layout with mixed quarters", () => {
        it("renders exact 3 quarter columns for Year 1 and 4 quarter columns for Year 2 without layout breakage", () => {
            const year1_3Q = {
                classGradeLevel: 7,
                classSection: "A",
                schoolYear: "2024-2025",
                adviserName: "Adviser One",
                generalAverage: 88,
                numQuarters: 3,
                subjects: [
                    {
                        subjectName: "Filipino",
                        subjectCode: "FIL",
                        q1: 85,
                        q2: 87,
                        q3: 90,
                        q4: null,
                        finalRating: 87,
                        remarks: "Passed"
                    }
                ]
            };

            const year2_4Q = {
                classGradeLevel: 8,
                classSection: "B",
                schoolYear: "2025-2026",
                adviserName: "Adviser Two",
                generalAverage: 91,
                numQuarters: 4,
                subjects: [
                    {
                        subjectName: "Filipino",
                        subjectCode: "FIL",
                        q1: 88,
                        q2: 90,
                        q3: 92,
                        q4: 94,
                        finalRating: 91,
                        remarks: "Passed"
                    }
                ]
            };

            const data = {
                numQuarters: 4,
                student: { lastname: "Dela Cruz", firstname: "Juan", suffix: null, middlename: "Santos" },
                scholastic: {
                    semester1: [year1_3Q, year2_4Q],
                    semester2: []
                },
                schoolInfo: { name: "Test School", schoolId: "123456", district: "District", region: "Region" },
                certification: {
                    studentName: "Juan Santos Dela Cruz",
                    studentLrn: "123456789012",
                    admission_to: 9,
                    schoolName: "Test School",
                    schoolId: "123456",
                    date: "10/23/26",
                    schoolPrincipal: "Principal Name",
                    lastSchoolYear: "2025-2026"
                },
                signature: null
            };

            const html = HTMLRenderer("studentRecord.ejs", data);

            // Year 1 (3 quarters) checks:
            // Quarter header: colspan="3"
            expect(html).toContain('<td colspan="3" class="text-center">');
            // Adviser header has colspan="2" when recNq is 3
            expect(html).toContain('<th colspan="2">');
            expect(html).toContain("Adviser One");
            // Remedial separator has colspan="7" (recNq + 4 = 7)
            expect(html).toContain('<td class="bg-gray-300" colspan="7"></td>');
            // Remedial conduct has colspan="6" (recNq + 3 = 6)
            expect(html).toContain('<td colspan="6">');

            // Year 2 (4 quarters) checks:
            // Quarter header: colspan="4"
            expect(html).toContain('<td colspan="4" class="text-center">');
            // Adviser header has colspan="3" when recNq is 4
            expect(html).toContain('<th colspan="3">');
            expect(html).toContain("Adviser Two");
            // Remedial separator has colspan="8" (recNq + 4 = 8)
            expect(html).toContain('<td class="bg-gray-300" colspan="8"></td>');
            // Remedial conduct has colspan="7" (recNq + 3 = 7)
            expect(html).toContain('<td colspan="7">');
        });

        it("renders only the selected school year record when filtered and omits Page 2", () => {
            const year1_3Q = {
                classGradeLevel: 7,
                classSection: "A",
                schoolYear: "2024-2025",
                adviserName: "Adviser One",
                generalAverage: 88,
                numQuarters: 3,
                subjects: [
                    {
                        subjectName: "Filipino",
                        subjectCode: "FIL",
                        q1: 85,
                        q2: 87,
                        q3: 90,
                        q4: null,
                        finalRating: 87,
                        remarks: "Passed"
                    }
                ]
            };

            const data = {
                numQuarters: 4,
                student: { lastname: "Dela Cruz", firstname: "Juan", suffix: null, middlename: "Santos" },
                scholastic: {
                    semester1: [year1_3Q],
                    semester2: []
                },
                schoolInfo: { name: "Test School", schoolId: "123456", district: "District", region: "Region" },
                certification: {
                    studentName: "Juan Santos Dela Cruz",
                    studentLrn: "123456789012",
                    admission_to: 8,
                    schoolName: "Test School",
                    schoolId: "123456",
                    date: "10/23/26",
                    schoolPrincipal: "Principal Name",
                    lastSchoolYear: "2024-2025"
                },
                signature: null
            };

            const html = HTMLRenderer("studentRecord.ejs", data);

            expect(html).toContain("Adviser One");
            expect(html).toContain("2024-2025");
            expect(html).not.toContain("Adviser Two");
            expect(html).not.toContain('<div class="page-break">');
        });
    });
});
