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
    // null when the year has no final ratings at all (computeGeneralAverage) —
    // the template renders that as a blank cell, never as a 0.
    generalAverage: number | null;
    // "Passed" / "Failed" from the same helper, or "N/A" when ungraded.
    generalAverageRemarks: string;
    numQuarters?: number;
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

export interface ClassSubjectSubmissionRow {
    id: number;
    classSubjectId: number;
    quarter: number;
    schoolYearId: number;
    status: QuarterSubmissionStatus;
    submittedAt: Date | string | null;
    submittedBy: number | null;
    totalStudents: number;
    submittedStudents: number;
    created_at?: string;
    updated_at?: string;
}

export interface TeacherSubjectOption {
    classSubjectId: number;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    subjectUnit: number;
    classId: number;
    classSection: string;
    classGradeLevel: number;
    totalStudents: number;
    submissionStatus: Record<number, QuarterSubmissionStatus>;
}

export interface SubjectStudentRow {
    enrollmentId: number;
    studentId: number;
    studentLrn: string | number;
    fullname: string;
    studentSex: string;
    writtenWorkScore: number | null;
    performanceTaskScore: number | null;
    quarterlyAssessmentScore: number | null;
    attendancePresentDays: number;
    attendanceTotalDays: number;
    attendanceRate: number | null;
    quarterGrade: number | null;
    source: "computed" | "frozen";
    isFrozen: boolean;
    status: QuarterSubmissionStatus;
    submittedAt: string | null;
    hasActiveAmendment: boolean;
    activePermissionId?: number | null;
    amendmentStatus?: string | null;
    amendmentRequestId?: number | null;
}

export interface StudentAssessmentScoreItem {
    id: number;
    title: string;
    type: "written_work" | "performance_task" | "quarterly_assessment";
    maxScore: number;
    currentScore: number | null;
}

export interface StudentAttendanceItem {
    id?: number;
    date: string;
    status: "present" | "absent" | "late" | "excused";
}

export interface SubjectStudentAmendData {
    permission: {
        id: number;
        requestId: number;
        status: string;
        expiresAt: string;
        recordType: string;
    };
    request: {
        id: number;
        requestNumber: string;
        status: string;
        reason: string;
        quarter: number;
    };
    student: {
        enrollmentId: number;
        fullname: string;
        studentLrn: string;
    };
    classSubject: {
        id: number;
        subjectName: string;
        subjectCode: string;
        classSection: string;
        classGradeLevel: number;
    };
    assessments: StudentAssessmentScoreItem[];
    attendance: StudentAttendanceItem[];
}

export interface SubjectClassRecordResponse {
    classSubjectId: number;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    classId: number;
    classSection: string;
    classGradeLevel: number;
    quarter: number;
    isSubjectSubmitted: boolean;
    submittedAt: string | null;
    submittedBy: number | null;
    submittedByName?: string | null;
    students: SubjectStudentRow[];
    progress: { total: number; submitted: number; pending: number };
}

export interface SubjectSubmissionSummaryRow {
    classSubjectId: number;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    classId: number;
    classSection: string;
    classGradeLevel: number;
    teacherId: number | null;
    teacherName: string;
    totalStudents: number;
    submitted: Record<number, number>;
    statusByQuarter: Record<number, QuarterSubmissionStatus>;
}
