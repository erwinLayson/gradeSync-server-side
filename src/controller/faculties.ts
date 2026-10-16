import type{Request, Response, NextFunction} from "express";


import {
    CreateFacultyService, 
    getAllFacultiesService, 
    getFacultyByUserIdService,
    getFacultyByIdService, 
    updateFacultyService, 
    deleteFacultyService, 
    getFacultySubjectDetailsFacultyByIdService
} from "../service/faculties.js";
import type { FacultyProps, FacultyUpdateProps, FacultyRole } from "../constant/faculties.js";
import { isFacultyRole, FACULTY_ROLE_VALUES } from "../constant/faculties.js";

// Helper Functions
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import NormalizedData from "../helper/normalizedData.js";

// Middleware / errors
import { ROLES } from "../constant/users.js";
import { BadRequestError, ForbiddenError } from "../middleware/errors.js";


// Create Faculty Controller
// `role` (teacher | register) is REQUIRED: an unknown or missing role is a
// 400, never a silent default (plan §3).
export async function CreateFacultyController(req: Request<{}, {}, Omit<FacultyProps, "id" | "userId">>, res: Response, next: NextFunction) {
    const {email, firstname, middlename, lastname, suffix, role} = req.body;
    // The request body is untrusted — treat it as unknown before validating.
    const rawRole: unknown = role;

    if (rawRole === undefined || rawRole === null || (typeof rawRole === "string" && rawRole.trim() === "")) {
        throw new BadRequestError(`"role" is required — one of: ${FACULTY_ROLE_VALUES.join(", ")}`);
    }
    if (!isFacultyRole(rawRole)) {
        throw new BadRequestError(`Unsupported faculty role "${String(rawRole)}" — one of: ${FACULTY_ROLE_VALUES.join(", ")}`);
    }

    const faculty = {
        email: NormalizedData(email), 
        firstname: NormalizedData(firstname, true),
        middlename: NormalizedData(middlename, true),
        lastname: NormalizedData(lastname, true), 
        ...(suffix && {suffix: NormalizedData(suffix, true)}),
        role: rawRole
    };

    Validate(faculty);

    try {
        await CreateFacultyService(faculty);
        res.status(201).json(
            SuccessResponse({message: "Faculty created successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Get all faculties controller
// Optional `?role=teacher|register` narrows the list — assignment pickers use it
// so register faculty never appear as teaching candidates (plan §6.2).
export async function getAllFacultiesController(req: Request<{}, {}, {}, {role?: string}>, res: Response, next: NextFunction) {
    const { role } = req.query;
    if (role !== undefined && !isFacultyRole(role)) {
        throw new BadRequestError(`"role" must be one of: ${FACULTY_ROLE_VALUES.join(", ")}`);
    }

    try {
        const faculties = await getAllFacultiesService(role as FacultyRole | undefined);
        res.status(200).json(
            SuccessResponse({
                message: "Faculties retrieved successfully",
                data: faculties
            })
        );
    }catch(err) {
        next(err);
    }
}


// Update faculty by ID controller
export async function UpdateFacultyController(req: Request<{id: number}, {}, FacultyUpdateProps>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const {email, firstname, middlename, lastname, suffix, role} = req.body;
    const faculty: FacultyUpdateProps = {
        ...(email !== undefined && { email: NormalizedData(email) }),
        ...(firstname !== undefined && { firstname: NormalizedData(firstname, true) }),
        ...(middlename !== undefined && { middlename: NormalizedData(middlename, true) }),
        ...(lastname !== undefined && { lastname: NormalizedData(lastname, true) }),
        ...(suffix !== undefined && { suffix: suffix ? NormalizedData(suffix, true) : null }),
        ...(role !== undefined && { role })
    };

    // Reject an unsupported role UP FRONT, before any other field is written.
    const rawRole: unknown = role;
    if (rawRole !== undefined && !isFacultyRole(rawRole)) {
        throw new BadRequestError(`Unsupported faculty role "${String(rawRole)}" — one of: ${FACULTY_ROLE_VALUES.join(", ")}`);
    }

    const validatedFields: Record<string, unknown> = { id };
    for (const field of ["email", "firstname", "middlename", "lastname"] as const) {
        if (faculty[field] !== undefined) {
            validatedFields[field] = faculty[field];
        }
    }
    Validate(validatedFields);

    try {
        // Faculties may only update their own profile; admins may update any.
        // A register-role account never gets here (route guard is admin+teacher).
        if (req.user?.role === ROLES.TEACHER) {
            const existing = await getFacultyByIdService(Number(id));
            if (!existing || existing.userId !== req.user.id) {
                throw new ForbiddenError("You can only update your own profile");
            }
        }

        // The service applies the school-year gate and the admin-only rule when
        // (and only when) `role` actually changes — a server-side 409/403 even
        // if the frontend wrongly enabled the field.
        await updateFacultyService(Number(id), faculty, req.user?.role);
        res.status(200).json(
            SuccessResponse({message: "Faculty updated successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Delete faculty by ID controller
export async function DeleteFacultyController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    Validate({id});

    try {
        await deleteFacultyService(Number(id));
        res.status(200).json(
            SuccessResponse({message: "Faculty deleted successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Get faculty by user ID controller
export async function getFacultyByUserIdController(req: Request<{userId: number}>, res: Response, next: NextFunction) {
    const {userId} = req.params;
    Validate({userId});

    try {
        const faculty = await getFacultyByUserIdService(Number(userId));
        res.status(200).json(
            SuccessResponse({
                message: "Faculty retrieved successfully",
                data: faculty
            })
        );
    }catch(err) {
        next(err);
    }
}

// Get faculty by ID controller
export async function getFacultyByIdController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    Validate({id});

    try {
        const faculty = await getFacultyByIdService(id);
        res.status(200).json(
            SuccessResponse({
                message: "Faculty retrieved successfully",
                data: faculty
            })
        );
    }catch(err) {
        next(err);
    }
}

// Get faculties subject details by faculties ID controller
export async function getFacultySubjectDetailsByIdController(req: Request<{facultyId: number}>, res: Response, next: NextFunction) {
    const {facultyId} = req.params;
    Validate({facultyId});
    try {
        const faculties = await getFacultySubjectDetailsFacultyByIdService(Number(facultyId));
        res.status(200).json(
            SuccessResponse({
                message: "Faculties retrieved successfully",
                data: faculties
            })
        );
    }catch(err) {
        next(err);
    }
}