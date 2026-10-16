// The school's authorized signature (one per school_info row). The image bytes
// are stored in the database (see migrations/0031_create_school_signature.sql) so
// they survive restarts on the deployment's ephemeral filesystem.

// Persisted signature metadata (never the raw bytes).
export interface SchoolSignatureMeta {
    mimeType: string;
    byteSize: number;
    updatedAt: string | null;
}

// Payload returned by GET /api/school-info/signature. `dataUrl` is a ready-to-
// render data: URL for the admin preview; the raw bytes never leave the server
// in any other form. `null` (not this type) means "no signature saved yet".
export interface SchoolSignatureProps extends SchoolSignatureMeta {
    dataUrl: string;
}

// Formats the shared magic-byte sniffer accepts. A canvas signature is always a
// PNG; JPEG/WebP are allowed for parity with the existing upload validator.
export const ALLOWED_SIGNATURE_MIME_TYPES: readonly string[] = [
    "image/png",
    "image/jpeg",
    "image/webp",
];

// Cap the upload at 1 MB — far above a normal signature PNG, small enough to keep
// a full row comfortably within TiDB limits.
export const MAX_SIGNATURE_BYTES = 1024 * 1024;
