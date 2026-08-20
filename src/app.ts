import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import type{Express} from "express";

import ErrorHandler from "./middleware/errorHandler.js"
import {checkDBConnection} from "./config/database.js";

// Checking database connection:
checkDBConnection()

//Import Routes
import UserRoutes from "./routes/users.js";
import StudentRoutes from "./routes/students.js"
import AuthRoutes from "./routes/auth.js"
import ClassroomRoutes from "./routes/classrooms.js"
import TeacherRoutes from "./routes/teachers.js"
import SubjectRoutes from "./routes/subjects.js"
import ClassStudentsRoutes from "./routes/class_students.js"
import ClassSubjectsRoutes from "./routes/class_subjects.js"
import SchoolYearRoutes from "./routes/schoolYear.js"
import EnrollmentRoutes from "./routes/enrollments.js"
import GradebookRoutes from "./routes/gradebook.js"
import AssessmentRoutes from "./routes/assessments.js"
import AttendanceRoutes from "./routes/attendance.js"
import AnalyticsRoutes from "./routes/analytics.js"
import SchoolInfoRoutes from "./routes/schoolInfo.js"
import GradingWeightDefaultsRoutes from "./routes/gradingWeightDefaults.js"
import AcademicSettingsRoutes from "./routes/academicSettings.js"
import StudentRecordRoutes from "./routes/studentRecord.js"
import StudentReportCardRoutes from "./routes/studentReportCard.js";


import getEnv from "./helper/getEnv.js";


const app: Express = express();

app.use(express.json());
app.use(cors({
    origin: [
        getEnv("LOCAL_CLIENT_ORG"),
        getEnv("DEPLOY_CLIENT_ORG")
    ],
    credentials: true,
}));
app.use(cookieParser());

//Use Routes
app.use("/api", AuthRoutes);
app.use("/api", UserRoutes);
app.use("/api", StudentRoutes);
app.use("/api", ClassroomRoutes);
app.use("/api", TeacherRoutes);
app.use("/api", SubjectRoutes);
app.use("/api", ClassStudentsRoutes);
app.use("/api", ClassSubjectsRoutes);
app.use("/api", SchoolYearRoutes);
app.use("/api", EnrollmentRoutes);
app.use("/api", GradebookRoutes);
app.use("/api", AssessmentRoutes);
app.use("/api", AttendanceRoutes);
app.use("/api", AnalyticsRoutes);
app.use("/api", SchoolInfoRoutes);
app.use("/api", GradingWeightDefaultsRoutes);
app.use("/api", AcademicSettingsRoutes);
app.use("/api", StudentRecordRoutes);
app.use("/api", StudentReportCardRoutes);

// Error middleware
app.use(ErrorHandler)

export default app