export interface DashboardSchoolYear {
    id: number;
    startYear: string;
    endYear: string;
}

export interface DashboardAttentionItem {
    id: string;
    type: "warning" | "error" | "info";
    message: string;
    detail: string;
    actionLabel: string;
    actionPath: string;
    count: number;
}

export interface DashboardAcademicProgress {
    gradeSubmission: { submitted: number; total: number } | null;
    classesWithoutAdviser: number;
    incompleteClasses: { classId: number; section: string; total: number; submitted: number }[];
}

export interface DashboardSummary {
    schoolYear: DashboardSchoolYear | null;
    academicQuarter: number;
    numQuarters: number;
    enrollmentOpen: boolean;
    students: number;
    teachers: number;
    classrooms: number;
    averageGrade: number | null;
    attendanceToday: { total: number; present: number; rate: number | null } | null;
    newStudentsThisWeek: number;
    gradedEnrollments: number;
    enrollmentCount: number;
    attentionItems: DashboardAttentionItem[];
    academicProgress: DashboardAcademicProgress;
}
