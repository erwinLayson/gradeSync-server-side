import type{Response, Request, NextFunction} from "express";

import {InternalServerError, AppError } from "./errors.js";

// Shape of errors raised by body-parser / http-errors (e.g. malformed JSON).
// They carry their own numeric `status` and a `type` discriminator.
type HttpErrorLike = Error & { status?: number; statusCode?: number; type?: string };

export default function ErrorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    if(err instanceof InternalServerError) {
        console.log(err.cause)
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    if(err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    // body-parser throws a SyntaxError carrying `status: 400` and
    // `type: "entity.parse.failed"` for malformed JSON. Honour the error's own
    // 4xx status instead of downgrading every such error to a generic 500.
    const httpErr = err as HttpErrorLike;
    const status = httpErr.status ?? httpErr.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
        return res.status(status).json({
            success: false,
            message: httpErr.type === "entity.parse.failed"
                ? "Invalid JSON in request body"
                : err.message
        });
    }

    console.log(err)
    return res.status(500).json({
    success: false,
    message: err.message,
  });
}
