import jwt from 'jsonwebtoken';
import type{ Request, Response, NextFunction } from 'express';

import type{User} from "../constant/users.js"
import getEnv from '../helper/getEnv.js';

// `req.params` is irrelevant here; `any` keeps this assignable to handlers on any route
export const ValidateToken = (req: Request<any>, res: Response, next: NextFunction) => {
    const token = req.cookies.login_token;

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized, No Token provided', success: false });
    }

    try {
        const decoded = jwt.verify(token, getEnv("JWT_SECRET"));
        req.user = decoded as User;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized, Invalid Token', success: false });
    }
}