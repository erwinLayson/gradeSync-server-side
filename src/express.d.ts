import {UserRoles} from "./constant/users.ts"

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number
                email: string,
                role: UserRoles
            }
        }
    }
}

export {}