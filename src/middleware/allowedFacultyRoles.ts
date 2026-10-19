import type { Request, Response, NextFunction } from "express";

import { getDBPoolConnection } from "../config/database.js";
import FacultyModel from "../model/faculties.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES, type FacultyRole } from "../constant/faculties.js";

// `register` is a FACULTY role, not a user role: the users table only knows
// admin / teacher / student / developer, and a faculty account (either kind)
// authenticates as users.role = "teacher". Faculty-specific capabilities — the
// registration workflow for `register`, every teaching duty for `teacher` —
// therefore come from the faculties row linked to the signed-in user, never
// from the token's role claim alone.
//
// This guard is the single place that resolution happens at the route layer:
//   * the user id comes from the VERIFIED token (req.user.id) — a request can
//     never name its own faculty record, so a client-supplied facultyId or
//     role is never trusted here;
//   * an account with no linked faculty record is refused (403) instead of
//     being treated as privileged;
//   * an account whose faculty role is not on the allow-list is refused (403).
//
// It is always registered AFTER ValidateToken + allowedRoles([...]): the user
// role answers "who signed in", this guard answers "what may their faculty
// record do".

interface AllowedFacultyRolesOptions {
    /**
     * Whether an `admin` account passes without a faculty record. Admin is a
     * privileged account type that has no faculties row, so routes that are
     * "admin + <faculty duty>" set this; a pure faculty-duty route leaves it
     * false and admins are refused by this layer.
     */
    allowAdmin?: boolean;
}

/**
 * `req.params` is irrelevant here; `any` keeps this assignable to handlers on
 * any route (same convention as allowedRoles / ValidateToken).
 */
export function allowedFacultyRoles(
    roles: FacultyRole[],
    options: AllowedFacultyRolesOptions = {},
) {
    const allowed = new Set<string>(roles);
    const allowAdmin = options.allowAdmin === true;

    return async (req: Request<any>, res: Response, next: NextFunction) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (user.role === ROLES.ADMIN) {
                return allowAdmin
                    ? next()
                    : res.status(403).json({ message: "Forbidden" });
            }

            // Every other account that can satisfy a faculty guard is a faculty
            // account (users.role = "teacher"). Students and developers are not
            // faculty and can never inherit a faculty capability.
            if (user.role !== ROLES.TEACHER) {
                return res.status(403).json({ message: "Forbidden" });
            }

            const pool = getDBPoolConnection();
            const connection = await pool.getConnection();
            try {
                const facultyModel = new FacultyModel(connection);
                const faculty = await facultyModel.getFacultyByUserId(user.id);

                // A faculty account with no faculty record owns nothing — this
                // must never fall through to a granted capability.
                if (!faculty) {
                    return res.status(403).json({
                        message: "No faculty profile is linked to this account",
                    });
                }

                if (!allowed.has(faculty.role)) {
                    return res.status(403).json({ message: "Forbidden" });
                }

                // Expose the verified record for controllers that need it; the
                // route decision itself is already final at this point.
                req.faculty = { id: faculty.id, role: faculty.role };
            } finally {
                connection.release();
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

export { FACULTY_ROLES };

