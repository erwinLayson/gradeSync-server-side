export class AppError extends Error {
    constructor(message: string, public readonly statusCode: number){
        super(message);

        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        Error.captureStackTrace(this);
    }
}

export class InternalServerError extends AppError {
    constructor(message: string, statusCode: number, public readonly cause?: unknown) {
        super(message, statusCode);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string, status: number){
        super(message, status);
    }
}

export class BadRequestError extends AppError {
    constructor(message: string){
        super(message, 400);
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string){
        super(message, 403);
    }
}

export class ConflictError extends AppError {
    constructor(message: string){
        super(message, 409);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string){
        super(message, 401);
    }
}
