export const AMENDMENT_RECORD_TYPES = {
    GRADEBOOK_SCORE: "gradebook_score",
    STUDENT_RECORD_GRADE: "student_record_grade",
    ATTENDANCE: "attendance",
} as const;

export type AmendmentRecordType = typeof AMENDMENT_RECORD_TYPES[keyof typeof AMENDMENT_RECORD_TYPES];

export const AMENDMENT_STATUSES = {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
    COMPLETED: "completed",
    EXPIRED: "expired",
    REVOKED: "revoked",
} as const;

export type AmendmentStatus = typeof AMENDMENT_STATUSES[keyof typeof AMENDMENT_STATUSES];

export const AMENDMENT_PERMISSION_STATUSES = {
    ACTIVE: "active",
    CONSUMED: "consumed",
    REVOKED: "revoked",
    EXPIRED: "expired",
} as const;

export type AmendmentPermissionStatus = typeof AMENDMENT_PERMISSION_STATUSES[keyof typeof AMENDMENT_PERMISSION_STATUSES];

export const AMENDMENT_AUDIT_ACTIONS = {
    REQUESTED: "requested",
    APPROVED: "approved",
    REJECTED: "rejected",
    MODIFIED: "modified",
    REOPENED: "reopened",
    RE_SUBMITTED: "re_submitted",
    CONSUMED: "consumed",
    EXPIRED: "expired",
    REVOKED: "revoked",
} as const;

export type AmendmentAuditAction = typeof AMENDMENT_AUDIT_ACTIONS[keyof typeof AMENDMENT_AUDIT_ACTIONS];

export interface AmendmentRequestDetails {
    assessmentId?: number;
    assessmentTitle?: string;
    attendanceDate?: string;
    currentValue?: number | string | null;
    proposedValue?: number | string | null;
    [key: string]: unknown;
}

export interface AmendmentRequestCreateProps {
    enrollmentId: number;
    classSubjectId?: number | null;
    classId: number;
    quarter: number;
    recordType: AmendmentRecordType;
    reason: string;
    details: AmendmentRequestDetails;
}

export interface AmendmentRequestRow {
    id: number;
    requestNumber: string;
    requesterFacultyId: number;
    requesterName?: string;
    enrollmentId: number;
    studentName?: string;
    studentLrn?: string;
    classSubjectId: number | null;
    subjectName?: string;
    classId: number;
    section?: string;
    gradeLevel?: number;
    quarter: number;
    recordType: AmendmentRecordType;
    reason: string;
    details: string; // JSON string in DB
    status: AmendmentStatus;
    reviewerUserId: number | null;
    reviewerName?: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
    completedAt: string | null;
    created_at: string;
    updated_at: string;
}

export interface AmendmentPermissionRow {
    id: number;
    requestId: number;
    facultyId: number;
    enrollmentId: number;
    classSubjectId: number | null;
    classId: number;
    quarter: number;
    recordType: AmendmentRecordType;
    assessmentId: number | null;
    attendanceDate: string | null;
    status: AmendmentPermissionStatus;
    expiresAt: string;
    consumedAt: string | null;
    created_at: string;
}

export interface AmendmentAuditLogRow {
    id: number;
    requestId: number | null;
    action: AmendmentAuditAction;
    actorUserId: number;
    actorName?: string;
    actorRole: string;
    recordType: AmendmentRecordType;
    enrollmentId: number;
    quarter: number;
    targetTable: string;
    targetRecordId: string;
    beforeState: string | null;
    afterState: string | null;
    diff: string | null;
    reason: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    created_at: string;
}

