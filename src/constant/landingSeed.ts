// Seed content for landing_content — mirrors DEFAULT_LANDING_CONTENT in
// client/src/constant/landingContent.ts so the DB starts in sync with the
// hardcoded page. Shared by migrate_all.mjs (step 18) and seed.ts.
//
// NOTE: migrate_all.mjs is plain .mjs (no TS imports), so it inlines this
// data. Keep the two in sync, or move the runner to a TS entry later.

import type {
    AboutContent,
    AudiencesContent,
    ContactContent,
    CtaContent,
    HeroContent,
    HowItWorksContent,
    LandingSectionContent,
    StatsContent,
} from "./landingContent.js";

export const LANDING_CONTENT_SEED: Record<string, LandingSectionContent> = {
    hero: {
        slides: [
            // Stable public asset paths (client/public/assets), NOT Vite's
            // hashed bundle URLs — the DB must survive rebuilds.
            { image: "/assets/hero-1.svg", label: "School campus" },
            { image: "/assets/hero-2.svg", label: "Classroom learning" },
            { image: "/assets/hero-3.svg", label: "Student graduation" },
        ],
        title: "School records,",
        titleAccent: " simplified.",
        subtitle:
            "Abang Suizu Integrated School runs on GradeSync — one system for grading, attendance, class submission and official school records, all in one place.",
    } satisfies HeroContent,
    stats: {
        rows: [
            { value: "3", label: "Roles, one system" },
            { value: "4", label: "Quarters tracked" },
            { value: "100%", label: "Digital records" },
            { value: "SF10", label: "Ready submissions" },
        ],
    } satisfies StatsContent,
    about: {
        heading: {
            eyebrow: "About Us",
            title: "A complete academic record system",
            text: "Abang Suizu Integrated School uses GradeSync to keep academic records accurate, organized and up to date — from daily attendance to the quarterly submission of official student records (SF10 / Form-137).",
        },
        features: [
            {
                iconKey: "FaUserGraduate",
                title: "Student Records",
                text: "Every learner's profile, enrollment and class placement in one place.",
            },
            {
                iconKey: "FaClipboardCheck",
                title: "Grading & Attendance",
                text: "Quarter grades computed automatically from teacher-entered scores and attendance.",
            },
            {
                iconKey: "FaBookOpen",
                title: "Class Submission",
                text: "Advisers review and submit frozen student records each quarter for SF10 / Form-137.",
            },
            {
                iconKey: "FaChartLine",
                title: "Reports & Analytics",
                text: "Dashboards for admins, report cards for teachers and prospects for students.",
            },
        ],
    } satisfies AboutContent,
    how_it_works: {
        heading: {
            eyebrow: "How it works",
            title: "From enrollment to Form-137",
            text: "Four steps connect the school office, the classrooms and every learner's permanent record.",
        },
        steps: [
            {
                step: "01",
                title: "Enroll the learner",
                text: "Admins record student information and place them in a class for the school year.",
            },
            {
                step: "02",
                title: "Record daily progress",
                text: "Teachers take attendance and encode scores in the gradebook as classes happen.",
            },
            {
                step: "03",
                title: "Grades compute themselves",
                text: "Quarterly grades are calculated automatically against the school's grading weights.",
            },
            {
                step: "04",
                title: "Submit official records",
                text: "Advisers review, freeze and submit class records for SF10 / Form-137 printing.",
            },
        ],
    } satisfies HowItWorksContent,
    audiences: {
        heading: {
            eyebrow: "Who it's for",
            title: "Built for every role in school",
            text: "Each role gets a workspace with exactly the tools it needs — nothing more, nothing missing.",
        },
        cards: [
            {
                iconKey: "FaSchool",
                title: "For Administrators",
                text: "See the whole school at a glance and keep records moving.",
                points: [
                    "Enrollment and records oversight",
                    "School-wide reports and analytics",
                    "Academic settings control",
                ],
            },
            {
                iconKey: "FaChalkboardTeacher",
                title: "For Teachers",
                text: "Spend less time on paperwork, more time teaching.",
                points: [
                    "Fast attendance taking",
                    "Gradebook with auto-computed grades",
                    "One-click class record submission",
                ],
            },
            {
                iconKey: "FaUserGraduate",
                title: "For Students",
                text: "Your school life, visible in one place.",
                points: ["Profile and class schedule", "Grades per quarter", "Subject prospectus tracking"],
            },
        ],
    } satisfies AudiencesContent,
    contact: {
        heading: {
            eyebrow: "Contact Us",
            title: "Reach the school office",
            text: "For login help or questions about records, get in touch with the school office during office hours.",
        },
        items: [
            {
                iconKey: "FiMapPin",
                title: "Address",
                lines: ["Abang Suizu Integrated School", "Your School Address Here"],
            },
            {
                iconKey: "FiMail",
                title: "Email",
                lines: ["admin@abangsuizu.edu.ph"],
            },
            {
                iconKey: "FiPhone",
                title: "Phone",
                lines: ["(000) 000-0000"],
            },
            {
                iconKey: "FiClock",
                title: "Office Hours",
                lines: ["Mon – Fri, 8:00 AM – 5:00 PM"],
            },
        ],
    } satisfies ContactContent,
    cta: {
        title: "Ready to simplify school records?",
        text: "Sign in with your school account — admins, teachers and students all use the same door.",
    } satisfies CtaContent,
};
