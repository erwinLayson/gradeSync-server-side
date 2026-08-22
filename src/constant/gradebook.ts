import type { SubjectComponent, ComponentGrade } from "./subjectComponents.js";

export interface GradebookDetails {
    classId: number,
    classSubjectId: number;
    classSection: string;
    classLevel: number;
    subjectId: number;
    subjectName: string,
    subjectCode: string,
    hasComponents: boolean,
}
