import {Router} from "express";

// Authentication Controller
import { LoginUserController, LogoutUserController, VerifyUserController } from "../controller/authentication.js";

// Middleware
import { ValidateToken } from "../middleware/validateToken.js";

const route: Router = Router();

// ==================== PUBLIC (NO AUTH) ====================
route.post("/users/login", LoginUserController);
route.post("/users/logout", LogoutUserController);

// ==================== AUTHENTICATED (ANY ROLE) ====================
route.get("/users/verify", ValidateToken, VerifyUserController);

export default route;