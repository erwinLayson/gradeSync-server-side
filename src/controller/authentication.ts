import type{Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";

// Constant Types
import type{LoginCredentials} from "../constant/auth.js"

// Service
import { LoginUserService } from "../service/authentication.js";

// Helpers Functions
import Validate from "../helper/validate.js";
import { SuccessResponse } from "../helper/response.js";
import getEnv from "../helper/getEnv.js";

export async function LoginUserController(req: Request<{}, {}, LoginCredentials>, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body;

        Validate({ email, password });

        const user = await LoginUserService({ email, password });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getEnv("JWT_SECRET"), { expiresIn: "1h" });
        
        res.cookie("login_token", token, {
            httpOnly: true,
            secure: getEnv("NODE_ENV") === "production",
            sameSite: getEnv("NODE_ENV") === "production" ? "none" : "strict",
            maxAge: 3600000 // 1 hour
        });

        res.status(200).json(
            SuccessResponse({
                message: "Login successful",
                data: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            })
        )
    }catch(err) {
        next(err);
    }
}

export async function VerifyUserController(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.user;
        return res.status(200).json(
            SuccessResponse({
                message: "User verified",
                data: user
            })
        )
    }catch(err) {
        next(err);
    }  
}

export async function LogoutUserController(req: Request, res: Response, next: NextFunction) {
    try {
        res.clearCookie("login_token", {
            httpOnly: true,
            secure: getEnv("NODE_ENV") === "production",
            sameSite: getEnv("NODE_ENV") === "production" ? "none" : "strict"
        });

        return res.status(200).json(
            SuccessResponse({
                message: "Logout successful"
            })
        )
    }catch(err) {
        next(err);
    }
}