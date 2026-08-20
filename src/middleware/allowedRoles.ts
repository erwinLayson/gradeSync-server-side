import type { Request, Response, NextFunction } from "express";

// `req.params` is irrelevant here; `any` keeps this assignable to handlers on any route
export default function allowedRoles(roles: string[]) {
    return (req: Request<any>, res: Response, next: NextFunction) => {
        const userRole = req?.user?.role;

        if(!userRole) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!roles.includes(userRole)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}