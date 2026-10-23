import { getDBPoolConnection } from "../config/database.js";

import StudentClassesModel from "../model/studentClasses.js";
import StudentDetailsModel from "../model/studentDetails.js";
import StudentRecordModel from "../model/studentRecord.js";
import ClassDailyAttendanceModel from "../model/classDailyAttendance.js";

// Grade computation building blocks (reused from the faculty gradebook)
import { getAssessmentService } from "./assessment.js";
import { getStudentScoreService } from "./studentScore.js";
import { getGradingWeightsService } from "./gradingWeight.js";
import { getAttendanceHistoryService } from "./studentAttendance.js";
import { computeQuarterGrade, computeCompositeQuarterGrade } from "./gradebook.js";
import { getSubjectComponentsWithConnection } from "./subjectComponents.js";
import { getNumQuarters } from "./academicSettings.js";
import { getQuarterArray } from "../helper/quarterValidation.js";

// Grade helpers — the app's single source of truth for subject finals, general
// averages and remarks. Never re-implement these inline.
import { calculateFinalGrade } from "../helper/calculateFinalGrade.js";
import { computeGeneralAverage } from "../helper/computeGeneralAverage.js";
import { getRemarks } from "../helper/getRemarks.js";
import { computeAttendanceRate } from "../helper/attendanceRate.js";

// Error handling
import { NotFoundError } from "../middleware/errors.js";
import { formatDate } from "../helper/formatDate.js";
import { determineRecordNumQuarters } from "./studentRecord.js";

import type { GradeWeights } from "../constant/grade.js";
import type { StudentScoreProps } from "../constant/grade.js";
import type { ComponentGrade, StudentAcademicRecordComponentRow } from "../constant/subjectComponents.js";

// calculateFinalGrade takes the raw stored strings (it Number()s them itself);
// this keeps the call sites readable.
function toGradeString(grade: number | null | undefined): string | null {
    return grade === null || grade === undefined ? null : String(grade);
}

// Frozen component breakdown for a composite subject record. The frozen schema
// does not snapshot component.weight, so the weight is reported as null instead
// of showing today's (possibly changed) configuration; the grades and the
// component's final rating are exact.
function buildFrozenComponentBreakdown(
    componentRows: StudentAcademicRecordComponentRow[],
    numQuarters: number
) {
    if (componentRows.length === 0) {
        return undefined;
    }
    return componentRows.map((row) => {
        const storedQuarters: (number | null)[] = [row.q1, row.q2, row.q3, row.q4].map((q) =>
            q === null || q === undefined ? null : Number(q)
        );
        return {
            componentId: row.componentId,
            name: row.componentName,
            code: row.componentCode,
            weight: null,
            grades: storedQuarters.slice(0, numQuarters),
            final: calculateFinalGrade(
                {
                    q1: toGradeString(storedQuarters[0]),
                    q2: toGradeString(storedQuarters[1]),
                    q3: toGradeString(storedQuarters[2]),
                    q4: toGradeString(storedQuarters[3])
                },
                numQuarters
            )
        };
    });
}

function formatStudentRow(row: any) {
    return {
        id: Number(row.id),
        lrn: row.lrn,
        email: row.email,
        fullname: [row.firstname, row.middlename, row.lastname]
            .filter(Boolean)
            .join(" ") + (row.suffix ? ` ${row.suffix}` : "")
    };
}

// The logged-in user's classes (all enrolled school years) with per-subject
// quarterly grades, finals, remarks, and the general average per class.
export async function getMyClassesService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);

        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        return await getStudentAcademicHistoryService(studentId, { skipFrozen: true });
    } finally {
        connection.release();
    }
}

// Student class attendance from class_daily_attendance (adviser records,
// report-card source). Returns the student's class-level attendance for
// each enrolled class, grouped by quarter.
export async function getStudentClassAttendanceService(userId: number, quarter?: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);

        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        const enrollments = await model.getEnrollmentsByStudentId(studentId);
        const classDailyModel = new ClassDailyAttendanceModel(connection);

        const classes = [];
        for (const enrollment of enrollments) {
            const records = await classDailyModel.getByEnrollmentForHistory(
                enrollment.classId,
                enrollment.enrollmentId,
                quarter
            );

            // Group by quarter
            const numQuarters = await getNumQuarters();
            const attendanceByQuarter = getQuarterArray(numQuarters).map((q) => {
                const quarterRecords = records.filter((r) => r.quarter === q);
                const presentDays = quarterRecords.filter((r) => r.status === "present").length;
                const totalDays = quarterRecords.length;
                return {
                    quarter: q,
                    presentDays,
                    totalDays,
                    absentDays: totalDays - presentDays,
                    percentage: computeAttendanceRate(presentDays, totalDays),
                    records: quarterRecords.map((r) => ({ date: r.date, status: r.status }))
                };
            });

            classes.push({
                enrollmentId: enrollment.enrollmentId,
                classId: enrollment.classId,
                schoolYearId: enrollment.schoolYearId,
                schoolYear: `${enrollment.startYear}–${enrollment.endYear}`,
                attendance: attendanceByQuarter
            });
        }

        return { classes };
    } finally {
        connection.release();
    }
}

// Student prospectus: frozen-record-only view of the student's academic
// history. Only completed school years are displayed; in-progress school
// years are excluded.
export async function getStudentProspectusService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);
        const studentId = await model.getStudentIdByUserId(userId);
        if (studentId === null) {
            throw new NotFoundError("Student record not found", 404);
        }
        return await getStudentAcademicHistoryService(studentId, { completedOnly: true });
    } finally {
        connection.release();
    }
}

// Academic history for one student (all enrolled school years) with per-subject
// quarterly grades, finals, remarks, and the general average per class. Shared
// by the student self-service view and the admin student-details view.
//
// When skipFrozen is true the live gradebook is always used, even when a
// frozen academic record exists. This is the student's "My Classroom" view
// where they should see their own activities, scores, and attendance.
// When skipFrozen is false (default) the frozen record takes priority —
// used by the admin academic-history view and the student prospectus.
// When completedOnly is true, in-progress / unfinalized school years are excluded.
export async function getStudentAcademicHistoryService(
    studentId: number,
    options?: { skipFrozen?: boolean; completedOnly?: boolean }
) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new StudentClassesModel(connection);

        const studentDetailsModel = new StudentDetailsModel(connection);
        const studentRow = await studentDetailsModel.getStudentRow(studentId);
        if (studentRow === null) {
            throw new NotFoundError("Student record not found", 404);
        }

        const enrollments = await model.getEnrollmentsByStudentId(studentId);

        const studentRecordModel = new StudentRecordModel(connection);
        // Configured grading periods (3 or 4) for the active school year
        const currentNumQuarters = await getNumQuarters();
        const schoolYearIds = enrollments
            .map((e) => e.schoolYearId)
            .filter((id): id is number => typeof id === "number");
        const schoolYearsWithQ4 = await studentRecordModel.getSchoolYearsWithQuarter4Data(schoolYearIds);

        const classes = [];
        for (const enrollment of enrollments) {
            // When completedOnly is true, skip school years that are still ongoing / in-progress.
            if (options?.completedOnly) {
                const isCompletedYear =
                    enrollment.enrollmentStatus === "completed" ||
                    enrollment.schoolYearStatus === "completed";
                if (!isCompletedYear) {
                    continue;
                }
            }

            // Frozen-first: a submitted academic record is the official, immutable
            // history. When one exists, render it exactly like the SF10 PDF — the
            // record's own section/grade/adviser snapshots and the frozen per-subject
            // grades — instead of today's live class structure, which drifts from
            // what was actually taught that year. Without a record (e.g. the current
            // in-progress school year) fall back to the live gradebook below.
            const frozenRecords = options?.skipFrozen ? [] : await studentRecordModel.getRecordsByEnrollmentIds([enrollment.enrollmentId]);
            const frozenRecord = options?.skipFrozen ? null : frozenRecords[0] ?? null;
            if (frozenRecord) {
                const subjectRows = await studentRecordModel.getSubjectRowsByRecordIds([frozenRecord.id]);
                const submissions = await studentRecordModel.getAllSubmissionsByRecordIds([frozenRecord.id]);
                const recNq = determineRecordNumQuarters(
                    enrollment,
                    subjectRows,
                    submissions,
                    schoolYearsWithQ4,
                    currentNumQuarters
                );

                // Frozen component grades (composite subjects), keyed by subject row.
                const componentRows = await studentRecordModel.getComponentRowsByRecordIds([frozenRecord.id]);
                const componentsByRowId = new Map<number, StudentAcademicRecordComponentRow[]>();
                for (const componentRow of componentRows) {
                    const list = componentsByRowId.get(componentRow.subjectRowId) ?? [];
                    list.push(componentRow);
                    componentsByRowId.set(componentRow.subjectRowId, list);
                }

                // The frozen quarter grades are reported exactly as stored (2-dp) —
                // any whole-number display belongs to the presentation layer.
                // Quarters beyond this record's grading periods are trimmed, and the
                // final rating + general average come from the shared helpers, so this
                // view is numerically identical to the SF9/SF10 for the same record.
                // Frozen rows have no live gradebook data, so
                // classSubjectId/faculty/unit/assessments/attendance are null/empty.
                const subjects = subjectRows.map((row) => {
                    const storedQuarters: (number | null)[] = [row.q1, row.q2, row.q3, row.q4].map((q) =>
                        q === null || q === undefined ? null : Number(q)
                    );
                    const quarters = storedQuarters.slice(0, recNq);
                    const final = calculateFinalGrade(
                        {
                            q1: toGradeString(storedQuarters[0]),
                            q2: toGradeString(storedQuarters[1]),
                            q3: toGradeString(storedQuarters[2]),
                            q4: toGradeString(storedQuarters[3])
                        },
                        recNq
                    );
                    return {
                        classSubjectId: null,
                        subjectId: null,
                        name: row.subjectName,
                        code: row.subjectCode,
                        unit: null,
                        faculty: null,
                        quarters,
                        final,
                        remarks: final === null ? null : getRemarks(final),
                        assessments: [],
                        attendance: [],
                        componentBreakdown: buildFrozenComponentBreakdown(
                            componentsByRowId.get(row.id) ?? [],
                            recNq
                        )
                    };
                });

                const generalAverage = computeGeneralAverage(
                    subjects.map((subject) => ({ finalGrades: subject.final }))
                ).score;

                // When completedOnly is requested, a record must have finalized grades.
                if (options?.completedOnly && generalAverage === null) {
                    continue;
                }

                classes.push({
                    enrollmentId: enrollment.enrollmentId,
                    classId: enrollment.classId,
                    section: frozenRecord.classSection,
                    gradeLevel: frozenRecord.classGradeLevel,
                    schoolYearId: enrollment.schoolYearId,
                    schoolYear: `${enrollment.startYear}-${enrollment.endYear}`,
                    adviser: frozenRecord.adviserName,
                    subjects,
                    generalAverage,
                    numQuarters: recNq
                });
                continue;
            }

            // In-progress school year / live gradebook fallback:
            // When completedOnly is true, skip live gradebook since this is an ongoing/unfinalized year.
            if (options?.completedOnly) {
                continue;
            }

            const recNq = determineRecordNumQuarters(
                enrollment,
                [],
                [],
                schoolYearsWithQ4,
                currentNumQuarters
            );

            const classroom = await model.getClassWithAdviser(enrollment.classId);
            if (classroom === null) {
                continue; // classroom was deleted; skip the orphaned enrollment
            }

            const subjectRows = await model.getClassSubjectsByClassId(enrollment.classId);
            const subjects = [];

            for (const subjectRow of subjectRows) {
                // Weights are per class subject (same for all quarters).
                const weights: GradeWeights = await getGradingWeightsService(subjectRow.classSubjectId, connection);

                // Full attendance history for this enrollment (records carry quarter).
                const attendanceHistory = await getAttendanceHistoryService(
                    subjectRow.classSubjectId,
                    enrollment.enrollmentId,
                    undefined,
                    undefined,
                    connection
                );

                // Attendance summary + records grouped per quarter.
                const attendanceByQuarter = getQuarterArray(recNq).map((quarter) => {
                    const records = attendanceHistory.records.filter((record) => record.quarter === quarter);
                    const presentDays = records.filter((record) => record.status === "present").length;
                    const totalDays = records.length;
                    return {
                        quarter,
                        presentDays,
                        totalDays,
                        percentage: computeAttendanceRate(presentDays, totalDays),
                        records: records.map((record) => ({ date: record.date, status: record.status }))
                    };
                });

                // Check if this subject has components (e.g., MAPEH)
                const components = await getSubjectComponentsWithConnection(subjectRow.subjectId, connection);
                const isCompositeSubject = components.length > 0;

                const quarters: (number | null)[] = [];
                const componentGradesByQuarter: ComponentGrade[][] = []; // Track component grades per quarter
                const assessments: {
                    id: number;
                    quarter: number;
                    type: string;
                    title: string;
                    maxScore: number;
                    dateGiven: string | null;
                    score: number | null;
                }[] = [];
                for (let quarter = 1; quarter <= recNq; quarter++) {
                    // Filter attendance to THIS quarter only — the gradebook
                    // must not bleed attendance from other quarters into this one.
                    const quarterRecords = attendanceHistory.records.filter((r) => r.quarter === quarter);
                    const quarterAttendance = quarterRecords.length > 0
                        ? {
                            presentDays: quarterRecords.filter((r) => r.status === "present").length,
                            totalDays: quarterRecords.length
                        }
                        : null;

                    const assessmentRows = await getAssessmentService(
                        { classSubjectId: subjectRow.classSubjectId, quarter },
                        connection
                    );
                    const scores: StudentScoreProps[] = await getStudentScoreService(
                        subjectRow.classSubjectId,
                        quarter,
                        connection
                    );

                    // Scores keyed by assessment id for THIS student's enrollment.
                    const scoresByAssessmentId: Record<number, number> = {};
                    for (const score of scores) {
                        if (score.enrollmentId === enrollment.enrollmentId) {
                            scoresByAssessmentId[score.assessmentId] = Number(score.score);
                        }
                    }

                    if (isCompositeSubject) {
                        // Composite subject: compute grade per component, then aggregate
                        const assessmentsByComponentId = new Map<number | null, typeof assessmentRows>();
                        for (const ass of assessmentRows) {
                            const key = ass.componentId ?? null;
                            const list = assessmentsByComponentId.get(key) ?? [];
                            list.push(ass);
                            assessmentsByComponentId.set(key, list);
                        }
                        const result = computeCompositeQuarterGrade(
                            components,
                            assessmentsByComponentId,
                            scoresByAssessmentId,
                            weights
                        );
                        quarters.push(result.quarterGrade);
                        componentGradesByQuarter.push(result.componentGrades);
                    } else {
                        // Flat subject: existing logic
                        quarters.push(computeQuarterGrade(assessmentRows, scoresByAssessmentId, weights, quarterAttendance));
                        componentGradesByQuarter.push([]);
                    }

                    for (const assessment of assessmentRows) {
                        const dateGiven = assessment.dateGiven;
                        assessments.push({
                            id: assessment.id,
                            quarter: assessment.quarter,
                            type: assessment.type,
                            title: assessment.title,
                            maxScore: Number(assessment.maxScore),
                            dateGiven: dateGiven ? formatDate(dateGiven) : null,
                            score: scoresByAssessmentId[assessment.id] ?? null
                        });
                    }
                }

                // Subject final rating: the same helper the SF9/SF10 use, over the
                // same quarters (`quarters` has one entry per configured period).
                const final = calculateFinalGrade(
                    {
                        q1: toGradeString(quarters[0] ?? null),
                        q2: toGradeString(quarters[1] ?? null),
                        q3: toGradeString(quarters[2] ?? null),
                        q4: toGradeString(quarters[3] ?? null)
                    },
                    recNq
                );

                // Build component grades breakdown for composite subjects. Each
                // component's own final rating comes from the same helper, so the
                // breakdown can never disagree with the composite quarter grades it
                // is built from.
                const componentBreakdown = isCompositeSubject && componentGradesByQuarter.length > 0
                    ? components.map((comp) => {
                        const grades = componentGradesByQuarter.map((cg) => cg.find(c => c.componentId === comp.id)?.grade ?? null);
                        return {
                            componentId: comp.id,
                            name: comp.name,
                            code: comp.code,
                            weight: comp.weight,
                            grades,
                            final: calculateFinalGrade(
                                {
                                    q1: toGradeString(grades[0] ?? null),
                                    q2: toGradeString(grades[1] ?? null),
                                    q3: toGradeString(grades[2] ?? null),
                                    q4: toGradeString(grades[3] ?? null)
                                },
                                recNq
                            )
                        };
                    })
                    : undefined;

                subjects.push({
                    classSubjectId: subjectRow.classSubjectId,
                    subjectId: subjectRow.subjectId,
                    name: subjectRow.name,
                    code: subjectRow.code,
                    unit: subjectRow.unit !== null && subjectRow.unit !== undefined ? Number(subjectRow.unit) : null,
                    faculty: subjectRow.facultyFullname,
                    quarters,
                    final,
                    remarks: final === null ? null : getRemarks(final),
                    assessments,
                    attendance: attendanceByQuarter,
                    componentBreakdown
                });
            }

            const generalAverage = computeGeneralAverage(
                subjects.map((subject) => ({ finalGrades: subject.final }))
            ).score;

            classes.push({
                enrollmentId: enrollment.enrollmentId,
                classId: classroom.id,
                section: classroom.section,
                gradeLevel: classroom.gradeLevel,
                schoolYearId: enrollment.schoolYearId,
                schoolYear: `${enrollment.startYear}–${enrollment.endYear}`,
                adviser: classroom.adviserFullname,
                subjects,
                generalAverage,
                numQuarters: recNq
            });
        }

        return {
            student: formatStudentRow(studentRow),
            classes
        };
    } finally {
        connection.release();
    }
}
