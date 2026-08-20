// Types for the quarterly student-record submission workflow (class advisers).
// See docs/student-record-submission.md for the design decisions (E1-E10).

// ---------------- stored rows ----------------

export interface StudentAcademicRecordRow {
    id: number;
    enrollmentId: number;
    classSection: string;
    classGradeLevel: number;
    adviserName: string;
}

// Frozen per-subject grades. The subject is stored as a name/code SNAPSHOT
// (no subjectId) — the record must stay readable and immutable even if the
// subject is later renamed or deleted (see docs/classroom-subject-management.md).
export interface StudentAcademicRecordSubjectRow {
    id: number;
    recordId: number;
    subjectName: string;
    subjectCode: string;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    q4: number | null;
}

// Frozen per-subject grades ready for the SF10 PDF render (name/code snapshots
// survive subject renames/deletes — see docs/classroom-subject-management.md).
export interface StudentRecordPdfSubject {
    subjectName: string;
    subjectCode: string;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    q4: number | null;
    // Average of the available quarters (DepEd style); null when nothing frozen.
    finalRating: number | null;
    remarks: "Passed" | "Failed" | "";
}

// One school year's frozen record for the SF10 PDF: record snapshots + grades.
export interface StudentRecordPdfEntry {
    enrollmentId: number;
    schoolYear: string;
    recordId: number | null;
    classSection: string | null;
    classGradeLevel: number | null;
    adviserName: string | null;
    subjects: StudentRecordPdfSubject[];
}

export type QuarterSubmissionStatus = "pending" | "submitted";

export interface QuarterSubmissionRow {
    id: number;
    recordId: number;
    quarter: number;
    status: QuarterSubmissionStatus;
    submittedAt: Date | string | null;
    submittedBy: number | null;
}

// ---------------- API response types ----------------

export interface ClassRecordSubject {
    classSubjectId: number;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
}

export interface StudentSubjectGrade {
    subjectId: number;
    // Whether the student is enrolled in this subject (E7: class subjects ∩ enrollment_details).
    enrolled: boolean;
    // The grade to display: computed live while pending, frozen qN once submitted.
    grade: number | null;
    source: "computed" | "frozen";
}

export interface StudentClassRecordRow {
    enrollmentId: number;
    studentId: number;
    studentLrn: number;
    fullname: string;
    studentSex: string;
    status: QuarterSubmissionStatus;
    // Timestamp of the last freeze; kept after a reopen for the audit trail (E5).
    submittedAt: string | null;
    recordId: number | null;
    subjects: StudentSubjectGrade[];
}

export interface ClassRecordsResponse {
    classId: number;
    section: string;
    gradeLevel: number;
    adviserId: number | null;
    adviserFullname: string | null;
    quarter: number;
    subjects: ClassRecordSubject[];
    students: StudentClassRecordRow[];
    progress: { total: number; submitted: number; pending: number };
}

export interface BlockedStudent {
    enrollmentId: number;
    fullname: string;
    missingSubjects: string[];
}

export interface SubmitAllResult {
    submitted: number;
    alreadySubmitted: number;
    blocked: BlockedStudent[];
}

export interface SubmissionSummaryRow {
    classId: number;
    section: string;
    gradeLevel: number;
    adviserId: number | null;
    adviserFullname: string | null;
    totalStudents: number;
    // quarter -> number of students with a submitted record for that quarter
    submitted: Record<number, number>;
}
