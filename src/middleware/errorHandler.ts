import type{Response, Request, NextFunction} from "express";

import {InternalServerError, AppError } from "./errors.js";

export default function ErrorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
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

    console.log(err)
    return res.status(500).json({
    success: false,
    message: err.message,
  });
}
