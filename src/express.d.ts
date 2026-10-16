import {UserRoles} from "./constant/users.ts"
import {FacultyRole} from "./constant/faculties.ts"

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number
                email: string,
                role: UserRoles
            }
            // Set by middleware/allowedFacultyRoles.ts once the caller's own
            // faculties row has been resolved and verified. Never taken from
            // the request body/query.
            faculty?: {
                id: number
                role: FacultyRole
            }
        }
    }
}

export {}
