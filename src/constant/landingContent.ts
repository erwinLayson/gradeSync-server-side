// Landing page content — per-section JSON blobs managed by the developer role
// via PATCH /landing-content/:section. Public read (GET /landing-content)
// feeds the anonymous landing page (docs/landing-content-plan.md).
//
// The shapes mirror client/src/constant/landingContent.ts (Phase 1 contract).
// Keep the two files in sync; the seed content mirrors the client defaults.

export interface HeroSlide {
    image: string;
    label: string;
}

export interface HeroContent {
    slides: HeroSlide[];
    title: string;
    titleAccent: string;
    subtitle: string;
}

export interface StatRow {
    value: string;
    label: string;
}

export interface StatsContent {
    rows: StatRow[];
}

export interface SectionHeading {
    eyebrow: string;
    title: string;
    text: string;
}

export interface FeatureCard {
    iconKey: string;
    title: string;
    text: string;
}

export interface AboutContent {
    heading: SectionHeading;
    features: FeatureCard[];
}

export interface StepCard {
    step: string;
    title: string;
    text: string;
}

export interface HowItWorksContent {
    heading: SectionHeading;
    steps: StepCard[];
}

export interface AudienceCard {
    iconKey: string;
    title: string;
    text: string;
    points: string[];
}

export interface AudiencesContent {
    heading: SectionHeading;
    cards: AudienceCard[];
}

export interface ContactItem {
    iconKey: string;
    title: string;
    lines: string[];
}

export interface ContactContent {
    heading: SectionHeading;
    items: ContactItem[];
}

export interface CtaContent {
    title: string;
    text: string;
}

export type LandingSectionContent =
    | HeroContent
    | StatsContent
    | AboutContent
    | HowItWorksContent
    | AudiencesContent
    | ContactContent
    | CtaContent;

export interface LandingContentRow {
    section: string;
    content: LandingSectionContent;
    updatedBy: number | null;
    updatedAt: string | null;
}

// Map shape consumed by the frontend: { [section]: content }.
export type LandingContentMap = Record<string, LandingSectionContent>;

/** Valid `section` path params — anything else is a 404. */
export const LANDING_SECTION_KEYS = [
    "hero",
    "stats",
    "about",
    "how_it_works",
    "audiences",
    "contact",
    "cta",
] as const;

export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];

/**
 * Icon whitelist shared with the client's ICON_REGISTRY (which imports the
 * react-icons components). The client falls back to a default icon for any
 * key outside this list; the server rejects keys outside it outright so the
 * two can never drift apart silently.
 */
export const LANDING_ICON_KEYS = [
    "FaBookOpen",
    "FaChalkboardTeacher",
    "FaChartLine",
    "FaClipboardCheck",
    "FaSchool",
    "FaUserGraduate",
    "FiCircle",
    "FiClock",
    "FiMail",
    "FiMapPin",
    "FiPhone",
] as const;

/** Per-array length caps so one stray paste can't bloat the public payload. */
export const LANDING_SECTION_LIMITS = {
    maxSlides: 6,
    maxStats: 8,
    maxFeatures: 8,
    maxSteps: 8,
    maxAudienceCards: 6,
    maxAudiencePoints: 8,
    maxContactItems: 8,
    maxContactLines: 4,
    maxString: 2000, // per text field
} as const;
