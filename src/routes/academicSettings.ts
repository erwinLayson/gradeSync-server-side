import { Router, type RequestHandler } from "express";

import { getAcademicSettingsController, updateAcademicSettingsController } from "../controller/academicSettings.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import {
    ALLOWED_TO_READ_ACADEMIC_SETTINGS,
    ALLOWED_TO_EDIT_ACADEMIC_SETTINGS,
} from "../constant/users.js";

const router: Router = Router();

// READ side — admin, teacher, and register all need the live grading config.
// The register role depends on `enrollmentOpen` while printing SF10 / Form-137
// records, so it is intentionally on the read side (docs/register-role-implementation-plan.md §6.2).
const readAcademicSettings: RequestHandler[] = [
    ValidateToken,
    allowedRoles([...ALLOWED_TO_READ_ACADEMIC_SETTINGS]),
];

// WRITE side — quarter and configuration changes remain admin-only.
const editAcademicSettings: RequestHandler[] = [
    ValidateToken,
    allowedRoles([...ALLOWED_TO_EDIT_ACADEMIC_SETTINGS]),
];// ==================== READ ====================
// Admin, teacher, and register consumers all read the live grading config.
router.get("/academic-settings", readAcademicSettings, getAcademicSettingsController);

// ==================== WRITE ====================
// Quarter and configuration changes remain admin-only.
// Only the fields named in AllowedAcademicSettingFields may be mutated here;
// any other key in the request body is silently dropped by the model layer
// (AcademicSettingsModel.updateSettings iterates AllowedAcademicSettingFields).
router.patch("/academic-settings", editAcademicSettings, updateAcademicSettingsController);

export default router;
