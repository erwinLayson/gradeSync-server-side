import path from "path";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";

import type { Request } from "express";

import { BadRequestError } from "../middleware/errors.js";
import { extensionForFormat, sniffImageFormat } from "../helper/imageValidation.js";

/*
 * Upload persistence (POST /api/uploads) — see routes/uploads.ts for the
 * transport config (multer) and static serving. This service owns everything
 * that touches disk: directory resolution, magic-byte validation, filename
 * generation and the absolute URL the client will later load.
 *
 * Security (plan §6.3):
 *   - The buffer is sniffed with magic bytes BEFORE anything touches disk;
 *     disallowed content never lands in the uploads dir.
 *   - Filenames are server-generated UUIDs; the client's filename is ignored.
 *   - The uploads dir is configured via UPLOAD_DIR (git-ignored).
 *   - Returns an ABSOLUTE url: client and server run on different origins.
 */

/** Minimal view of the uploaded file the service needs (multer-agnostic). */
export interface UploadedImageFile {
    buffer: Buffer;
    size: number;
}

export interface SavedUpload {
    filename: string;
    size: number;
    format: "jpeg" | "png" | "webp";
}

// Deferred env read: ESM evaluates service modules BEFORE app.ts's
// dotenv.config() runs, so a module-load read of process.env could see a
// not-yet-configured value. A safe default keeps boot deterministic; the env
// var is read per-call instead (after dotenv has run).
export function getUploadsDir(): string {
    return process.env.UPLOAD_DIR ?? "./uploads";
}

export function buildUploadUrl(req: Request, filename: string): string {
    const override = process.env.SERVER_ORIGIN?.trim().replace(/\/$/, "");
    if (override) {
        return `${override}/api/uploads/${filename}`;
    }
    // Behind a load balancer (e.g. Render terminates TLS), read the forwarded
    // scheme; otherwise fall back to the socket for plain localhost HTTP.
    const scheme = req.get("X-Forwarded-Proto") ?? req.protocol;
    const host = req.get("host");
    return `${scheme}://${host}/api/uploads/${filename}`;
}

export async function saveUploadService(file: UploadedImageFile): Promise<SavedUpload> {
    // Magic-byte check: the declared mimetype is client-controlled, the bytes
    // are not. Reject SVG/HTML/anything else disguised as an image. If the
    // bytes say JPEG but the browser declared .png, trust the bytes — the
    // canonical extension comes from the sniff.
    const format = sniffImageFormat(file.buffer);
    if (!format) {
        throw new BadRequestError("File content is not a valid JPEG, PNG or WebP image");
    }

    const filename = `${crypto.randomUUID()}${extensionForFormat(format)}`;
    const uploadsDir = getUploadsDir();

    // Fully written BEFORE responding — no partial-file races.
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, filename), file.buffer);

    return { filename, size: file.size, format };
}