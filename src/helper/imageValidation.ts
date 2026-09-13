// Magic-byte sniffing for the three whitelisted raster formats. The MIME type
// reported by the browser (file.type / multer's mimetype) is client-declared
// and trivially spoofed, so the actual bytes decide — plan §6.3.
//
// No extra dependency: the signatures are short and stable.

export type SniffedImageFormat = "jpeg" | "png" | "webp" | null;

// JPEG: FF D8 FF (SOI marker + first marker byte)
const JPEG = [0xff, 0xd8, 0xff];

// PNG: 89 50 4E 47 0D 0A 1A 0A
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// WebP: "RIFF" ???? "WEBP" (bytes 8-11)
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
    if (buffer.length < offset + signature.length) return false;
    return signature.every((byte, index) => buffer[offset + index] === byte);
}

/** Detects the real image format from magic bytes; null if not whitelisted. */
export function sniffImageFormat(buffer: Buffer): SniffedImageFormat {
    if (startsWith(buffer, JPEG)) return "jpeg";
    if (startsWith(buffer, PNG)) return "png";
    if (startsWith(buffer, RIFF, 0) && startsWith(buffer, WEBP, 8)) return "webp";
    return null;
}

/** Canonical extension (with dot) for a sniffed format. */
export function extensionForFormat(format: SniffedImageFormat): string {
    switch (format) {
        case "jpeg":
            return ".jpg";
        case "png":
            return ".png";
        case "webp":
            return ".webp";
        default:
            return "";
    }
}
