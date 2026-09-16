import type { Request, Response, NextFunction } from "express";
import { existsSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

import { getWipeStatus, executeWipe, WIPE_PHRASES, type WipeScope } from "../model/systemWipe.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from "../middleware/errors.js";
import { getUploadsDir } from "../service/upload.js";

/**
 * Single-flight guard (docs/developer-data-wipe-plan.md Phase C).
 *
 * Only one wipe may run at a time, process-wide. The flag is set before any
 * destructive work starts and cleared in a `finally` block so even a thrown
 * error can never wedge the endpoint shut. This also collapses the
 * uploads-directory race (two concurrent wipes deleting the same files),
 * which Node's single event loop alone would not prevent because the
 * awaits between checks and deletes interleave.
 */
let wipeInFlight = false;

/** POST /system/wipe — body: { scope, confirmation } */
export async function wipeSystemController(req: Request, res: Response, next: NextFunction) {
    try {
        const { scope, confirmation } = (req.body ?? {}) as { scope?: string; confirmation?: string };

        if (!scope || !(scope in WIPE_PHRASES)) {
            throw new BadRequestError(`Unknown wipe scope: ${scope ?? "(missing)"}`);
        }
        const wipeScope = scope as WipeScope;

        // The typed phrase is validated HERE, on the server — the client-side
        // check is UX only, never the guard.
        if (!confirmation || confirmation !== WIPE_PHRASES[wipeScope]) {
            throw new ForbiddenError(
                `Confirmation phrase does not match. This wipe was NOT executed.`,
            );
        }

        const requesterId = req.user?.id;
        if (!requesterId) {
            throw new UnauthorizedError("Authentication required for wipe actions");
        }

        if (wipeInFlight) {
            throw new ConflictError(
                "A wipe is already in progress — wait for it to finish before starting another.",
            );
        }
        wipeInFlight = true;
        try {
            // "uploads" scope deletes files on disk (and has no DB rows to clear).
            if (wipeScope === "uploads") {
                const uploadFilesDeleted = await clearUploadsDirectory();
                return res.status(200).json(
                    SuccessResponse({
                        message: `Uploads wiped — ${uploadFilesDeleted} file(s) deleted`,
                        data: { tables: [], uploadFilesDeleted, durationMs: 0 },
                    }),
                );
            }

            const result = await executeWipe(wipeScope, requesterId);

            // The master scope also erases uploaded files on disk (plan §2 row 7).
            // This happens AFTER the DB transaction commits: file deletion cannot
            // be transactional, and DB-dead rows pointing at orphaned files are
            // the safer failure mode than the reverse.
            let uploadFilesDeleted: number | undefined;
            if (wipeScope === "all") {
                uploadFilesDeleted = await clearUploadsDirectory();
            }

            res.status(200).json(
                SuccessResponse({
                    message: `Wipe "${wipeScope}" completed in ${result.durationMs}ms`,
                    data: { ...result, uploadFilesDeleted },
                }),
            );
        } finally {
            // Cleared on every path — success, thrown error, even the early
            // uploads return — so the endpoint can never wedge shut.
            wipeInFlight = false;
        }
    } catch (err) {
        next(err);
    }
}

/** GET /system/wipe/status — per-table row counts for the UI preview. */
export async function wipeStatusController(_req: Request, res: Response, next: NextFunction) {
    try {
        const tables = await getWipeStatus();
        res.status(200).json(
            SuccessResponse({
                message: "Wipe status retrieved",
                data: { tables },
            }),
        );
    } catch (err) {
        next(err);
    }
}

/** Delete every file in the uploads directory; returns the count. */
async function clearUploadsDirectory(): Promise<number> {
    // Same directory resolution as the upload service itself (UPLOAD_DIR env
    // or ./uploads, git-ignored).
    const dir = getUploadsDir();
    if (!existsSync(dir)) return 0;

    const entries = await readdir(dir);
    let deleted = 0;
    for (const entry of entries) {
        await unlink(path.join(dir, entry));
        deleted += 1;
    }
    return deleted;
}


