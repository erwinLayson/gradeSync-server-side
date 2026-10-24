// The school's uploaded logo (one per school_info row). The image bytes are
// stored in the database (see migrations/0034_create_school_logo.sql) so they
// survive restarts on the deployment's ephemeral filesystem.

// Persisted logo metadata (never the raw bytes).
export interface SchoolLogoMeta {
    mimeType: string;
    byteSize: number;
    updatedAt: string | null;
}

// Payload returned by GET /api/school-info/logo. `dataUrl` is a ready-to-render
// data: URL for the sidebar and admin preview; the raw bytes never leave the
// server in any other form. `null` (not this type) means "no logo saved yet".
export interface SchoolLogoProps extends SchoolLogoMeta {
    dataUrl: string;
}

// Formats the shared magic-byte sniffer accepts. SVG is deliberately rejected:
// stored SVG is an XSS vector when rendered inline.
export const ALLOWED_LOGO_MIME_TYPES: readonly string[] = [
    "image/png",
    "image/jpeg",
    "image/webp",
];

// Cap the upload at 5 MB - enough for a high-resolution school logo while
// staying comfortably within the database's MEDIUMBLOB limit.
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

// Persist logos in chunks so no single INSERT exceeds MySQL's default 1 MB
// max_allowed_packet (see migrations/0035_create_school_logo_chunks.sql).
export const LOGO_CHUNK_BYTES = 256 * 1024;
