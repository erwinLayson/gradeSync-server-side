import {
    BadRequestError,
} from "../middleware/errors.js";

import type {
    AboutContent,
    AudiencesContent,
    ContactContent,
    CtaContent,
    HeroContent,
    HeroSlide,
    HowItWorksContent,
    LandingSectionContent,
    LandingSectionKey,
    StatsContent,
} from "../constant/landingContent.js";
import { LANDING_ICON_KEYS, LANDING_SECTION_LIMITS } from "../constant/landingContent.js";

/*
 * Per-section payload validators for PATCH /landing-content/:section.
 *
 * Strategy: validate strictly, sanitize strings (trim), and REBUILD plain
 * objects containing only the whitelisted fields. Whatever reaches the DB is
 * guaranteed to match the section's shape — extra/unknown properties are
 * dropped, not stored.
 *
 * Icon keys are checked against LANDING_ICON_KEYS (server-side whitelist,
 * mirroring the client ICON_REGISTRY).
 */

const LIMITS = LANDING_SECTION_LIMITS;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(
    value: unknown,
    field: string,
    { max = LIMITS.maxString, required = true }: { max?: number; required?: boolean } = {},
): string {
    if (value === undefined || value === null) {
        if (required) throw new BadRequestError(`"${field}" is required`);
        return "";
    }
    if (typeof value !== "string") {
        throw new BadRequestError(`"${field}" must be a string`);
    }
    const trimmed = value.trim();
    if (required && trimmed.length === 0) {
        throw new BadRequestError(`"${field}" must not be empty`);
    }
    if (trimmed.length > max) {
        throw new BadRequestError(`"${field}" must be at most ${max} characters`);
    }
    return trimmed;
}

function strArray(value: unknown, field: string, maxItems: number): string[] {
    if (!Array.isArray(value)) {
        throw new BadRequestError(`"${field}" must be an array`);
    }
    if (value.length > maxItems) {
        throw new BadRequestError(`"${field}" must have at most ${maxItems} items`);
    }
    return value.map((item, index) => str(item, `${field}[${index}]`));
}

function iconKey(value: unknown, field: string): string {
    const key = str(value, field, { max: 64 });
    if (!(LANDING_ICON_KEYS as readonly string[]).includes(key)) {
        throw new BadRequestError(`"${field}" is not a whitelisted icon key`);
    }
    return key;
}

// ---------------------------------------------------------------------------

function validateHeroSlide(value: unknown, index: number): HeroSlide {
    if (!isRecord(value)) throw new BadRequestError(`slides[${index}] must be an object`);
    return {
        image: str(value.image, `slides[${index}].image`, { max: 2048 }),
        label: str(value.label, `slides[${index}].label`, { max: 200 }),
    };
}

function validateHero(body: unknown): HeroContent {
    if (!isRecord(body)) throw new BadRequestError("hero content must be an object");
    if (!Array.isArray(body.slides)) throw new BadRequestError('"slides" must be an array');
    if (body.slides.length === 0) throw new BadRequestError('"slides" must have at least 1 item');
    if (body.slides.length > LIMITS.maxSlides) {
        throw new BadRequestError(`"slides" must have at most ${LIMITS.maxSlides} items`);
    }
    return {
        slides: body.slides.map((slide, index) => validateHeroSlide(slide, index)),
        title: str(body.title, "title", { max: 300 }),
        titleAccent: str(body.titleAccent, "titleAccent", { max: 300 }),
        subtitle: str(body.subtitle, "subtitle", { max: 600 }),
    };
}

function validateStats(body: unknown): StatsContent {
    if (!isRecord(body)) throw new BadRequestError("stats content must be an object");
    if (!Array.isArray(body.rows)) throw new BadRequestError('"rows" must be an array');
    if (body.rows.length === 0) throw new BadRequestError('"rows" must have at least 1 item');
    if (body.rows.length > LIMITS.maxStats) {
        throw new BadRequestError(`"rows" must have at most ${LIMITS.maxStats} items`);
    }
    return {
        rows: body.rows.map((row, index) => {
            if (!isRecord(row)) throw new BadRequestError(`rows[${index}] must be an object`);
            return {
                value: str(row.value, `rows[${index}].value`, { max: 50 }),
                label: str(row.label, `rows[${index}].label`, { max: 200 }),
            };
        }),
    };
}

function validateSectionHeading(
    value: unknown,
    prefix: string,
): { eyebrow: string; title: string; text: string } {
    if (!isRecord(value)) throw new BadRequestError(`"${prefix}" is required`);
    return {
        eyebrow: str(value.eyebrow, `${prefix}.eyebrow`, { max: 100 }),
        title: str(value.title, `${prefix}.title`, { max: 300 }),
        text: str(value.text, `${prefix}.text`, { max: 1000 }),
    };
}

function validateAbout(body: unknown): AboutContent {
    if (!isRecord(body)) throw new BadRequestError("about content must be an object");
    if (!Array.isArray(body.features)) throw new BadRequestError('"features" must be an array');
    if (body.features.length === 0) throw new BadRequestError('"features" must have at least 1 item');
    if (body.features.length > LIMITS.maxFeatures) {
        throw new BadRequestError(`"features" must have at most ${LIMITS.maxFeatures} items`);
    }
    return {
        heading: validateSectionHeading(body.heading, "heading"),
        features: body.features.map((feature, index) => {
            if (!isRecord(feature)) throw new BadRequestError(`features[${index}] must be an object`);
            return {
                iconKey: iconKey(feature.iconKey, `features[${index}].iconKey`),
                title: str(feature.title, `features[${index}].title`, { max: 200 }),
                text: str(feature.text, `features[${index}].text`, { max: 600 }),
            };
        }),
    };
}

function validateHowItWorks(body: unknown): HowItWorksContent {
    if (!isRecord(body)) throw new BadRequestError("how_it_works content must be an object");
    if (!Array.isArray(body.steps)) throw new BadRequestError('"steps" must be an array');
    if (body.steps.length === 0) throw new BadRequestError('"steps" must have at least 1 item');
    if (body.steps.length > LIMITS.maxSteps) {
        throw new BadRequestError(`"steps" must have at most ${LIMITS.maxSteps} items`);
    }
    return {
        heading: validateSectionHeading(body.heading, "heading"),
        steps: body.steps.map((step, index) => {
            if (!isRecord(step)) throw new BadRequestError(`steps[${index}] must be an object`);
            return {
                step: str(step.step, `steps[${index}].step`, { max: 10 }),
                title: str(step.title, `steps[${index}].title`, { max: 200 }),
                text: str(step.text, `steps[${index}].text`, { max: 600 }),
            };
        }),
    };
}

function validateAudiences(body: unknown): AudiencesContent {
    if (!isRecord(body)) throw new BadRequestError("audiences content must be an object");
    if (!Array.isArray(body.cards)) throw new BadRequestError('"cards" must be an array');
    if (body.cards.length === 0) throw new BadRequestError('"cards" must have at least 1 item');
    if (body.cards.length > LIMITS.maxAudienceCards) {
        throw new BadRequestError(`"cards" must have at most ${LIMITS.maxAudienceCards} items`);
    }
    return {
        heading: validateSectionHeading(body.heading, "heading"),
        cards: body.cards.map((card, index) => {
            if (!isRecord(card)) throw new BadRequestError(`cards[${index}] must be an object`);
            return {
                iconKey: iconKey(card.iconKey, `cards[${index}].iconKey`),
                title: str(card.title, `cards[${index}].title`, { max: 200 }),
                text: str(card.text, `cards[${index}].text`, { max: 600 }),
                points: strArray(card.points, `cards[${index}].points`, LIMITS.maxAudiencePoints),
            };
        }),
    };
}

function validateContact(body: unknown): ContactContent {
    if (!isRecord(body)) throw new BadRequestError("contact content must be an object");
    if (!Array.isArray(body.items)) throw new BadRequestError('"items" must be an array');
    if (body.items.length === 0) throw new BadRequestError('"items" must have at least 1 item');
    if (body.items.length > LIMITS.maxContactItems) {
        throw new BadRequestError(`"items" must have at most ${LIMITS.maxContactItems} items`);
    }
    return {
        heading: validateSectionHeading(body.heading, "heading"),
        items: body.items.map((item, index) => {
            if (!isRecord(item)) throw new BadRequestError(`items[${index}] must be an object`);
            return {
                iconKey: iconKey(item.iconKey, `items[${index}].iconKey`),
                title: str(item.title, `items[${index}].title`, { max: 200 }),
                lines: strArray(item.lines, `items[${index}].lines`, LIMITS.maxContactLines),
            };
        }),
    };
}

function validateCta(body: unknown): CtaContent {
    if (!isRecord(body)) throw new BadRequestError("cta content must be an object");
    return {
        title: str(body.title, "title", { max: 300 }),
        text: str(body.text, "text", { max: 600 }),
    };
}

// ---------------------------------------------------------------------------

const VALIDATORS: Record<LandingSectionKey, (body: unknown) => LandingSectionContent> = {
    hero: validateHero,
    stats: validateStats,
    about: validateAbout,
    how_it_works: validateHowItWorks,
    audiences: validateAudiences,
    contact: validateContact,
    cta: validateCta,
};

/**
 * Validates and sanitizes a section payload. Throws BadRequestError (400) on
 * any shape violation. Returns a rebuilt object with only whitelisted fields.
 */
export function validateLandingSectionContent(
    section: LandingSectionKey,
    body: unknown,
): LandingSectionContent {
    const validator = VALIDATORS[section];
    if (!validator) {
        throw new BadRequestError("Unknown landing section");
    }
    return validator(body);
}
