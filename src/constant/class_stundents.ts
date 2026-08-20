export interface ClassStudentProps {
    classId: number;
    classSection: string
    classGradeLevel: number;
    adviserId?: number | null;
    adviserFullname?: string | null;
}