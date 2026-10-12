import { getStudentAcademicHistoryService } from "./studentClasses.js";

// Return only school years that already have a submitted/frozen academic
// record for the student. The frozen branch is the official, immutable
// history — used here so the admin sees past *submitted* grades before
// enrolling the student in a new school year.
export interface PastSubmittedGradesPayload {
    student: {
        id: number;
        lrn: string;
        email: string;
        fullname: string;
    };
    classes: {
        enrollmentId: number;
        classId: number;
        section: string;
        gradeLevel: number;
        schoolYearId: number;
        schoolYear: string;
        adviser: string | null;
        subjects: {
            name: string;
            code: string;
            unit: number | null;
            quarters: (number | null)[];
            final: number | null;
            remarks: string | null;
        }[];
        generalAverage: number | null;
    }[];
}

export async function getPastSubmittedGradesService(studentId: number): Promise<PastSubmittedGradesPayload> {
    const full = await getStudentAcademicHistoryService(studentId, { skipFrozen: false });

    const classes = full.classes.filter((cls) => {
        // Only include school years backed by a submitted academic record.
        // Frozen records are the ones that already have a finalized quarter
        // submission; the live (in-progress) school year has no frozen record
        // and is therefore excluded here.
        return cls.subjects.length > 0 && cls.subjects.some((subject) => subject.final !== null);
    });

    return {
        student: full.student,
        classes: classes.map((cls) => ({
            enrollmentId: cls.enrollmentId,
            classId: cls.classId,
            section: cls.section,
            gradeLevel: cls.gradeLevel,
            schoolYearId: cls.schoolYearId,
            schoolYear: cls.schoolYear,
            adviser: cls.adviser,
            subjects: cls.subjects.map((subject) => ({
                name: subject.name,
                code: subject.code,
                unit: subject.unit,
                quarters: subject.quarters,
                final: subject.final,
                remarks: subject.remarks,
            })),
            generalAverage: cls.generalAverage,
        })),
    };
}
