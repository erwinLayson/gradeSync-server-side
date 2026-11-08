export const AUDIT_ACTIONS = {
    REPORT_CARD_GENERATED: "report_card_generated",
    GRADE_SUBMITTED: "grade_submitted",
    ACTIVITY_CREATED: "activity_created",
    ACTIVITY_UPDATED: "activity_updated",
    ACTIVITY_DELETED: "activity_deleted",
    ATTENDANCE_RECORDED: "attendance_recorded",
    ATTENDANCE_UPDATED: "attendance_updated",
    STUDENT_ENROLLED: "student_enrolled",
    ENROLLMENT_STATUS_UPDATED: "enrollment_status_updated",
} as const;

export type ActivityAuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | (string & {});

export const AUDIT_ENTITY_TYPES = {
    REPORT_CARD: "report_card",
    GRADE_SUBMISSION: "grade_submission",
    ASSESSMENT: "assessment",
    ATTENDANCE: "attendance",
    ENROLLMENT: "enrollment",
} as const;

export type ActivityAuditEntityType = (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES] | (string & {});

export type ActivityAuditStatus = "success" | "failed";

export interface ActivityAuditInput {
    actorUserId: number;
    actorName?: string;
    actorRole?: string;
    actorFacultyId?: number | null;
    action: ActivityAuditAction;
    description: string;
    entityType: ActivityAuditEntityType;
    entityId?: string | null;
    schoolYearId?: number | null;
    schoolYear?: string | null;
    classroomId?: number | null;
    classroomName?: string | null;
    gradeLevel?: number | null;
    subjectId?: number | null;
    subjectName?: string | null;
    quarter?: number | null;
    status?: ActivityAuditStatus;
    beforeState?: unknown | null;
    afterState?: unknown | null;
    diff?: unknown | null;
    metadata?: unknown | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface ActivityAuditLogRow {
    id: number;
    actorUserId: number;
    actorName: string;
    actorRole: string;
    actorFacultyId: number | null;
    action: ActivityAuditAction;
    description: string;
    entityType: ActivityAuditEntityType;
    entityId: string | null;
    schoolYearId: number | null;
    schoolYear: string | null;
    classroomId: number | null;
    classroomName: string | null;
    gradeLevel: number | null;
    subjectId: number | null;
    subjectName: string | null;
    quarter: number | null;
    status: ActivityAuditStatus;
    beforeState: unknown | null;
    afterState: unknown | null;
    diff: unknown | null;
    metadata: unknown | null;
    ipAddress: string | null;
    userAgent: string | null;
    created_at: string | Date;
}

export interface ActivityAuditFilter {
    actorUserId?: number;
    actorRole?: string;
    action?: string;
    entityType?: string;
    schoolYearId?: number;
    gradeLevel?: number;
    classroomId?: number;
    subjectId?: number;
    quarter?: number;
    status?: ActivityAuditStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}

export interface ActivityAuditPagination {
    page: number;
    limit: number;
}

export interface ActivityAuditPaginatedResult {
    data: ActivityAuditLogRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ActivityAuditStats {
    total: number;
    today: number;
    thisWeek: number;
    byRole: { role: string; count: number }[];
    byAction: { action: string; count: number }[];
    byUser: { actorUserId: number; actorName: string; actorRole: string; count: number }[];
    recentActivities: ActivityAuditLogRow[];
}
