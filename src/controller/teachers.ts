import type{Request, Response, NextFunction} from "express";


import {
    CreateTeacherService, 
    getAllTeachersService, 
    getTeacherByUserIdService,
    getTeacherByIdService, 
    updateTeacherService, 
    deleteTeacherService, 
    getTeacherSubjectDetailsTeacherByIdService
} from "../service/teachers.js";
import type { TeacherProps, TeacherUpdateProps } from "../constant/teachers.js";

// Helper Functions
import { SuccessResponse } from "../helper/response.js";
import Validate from "../helper/validate.js";
import NormalizedData from "../helper/normalizedData.js";

// Middleware / errors
import { ROLES } from "../constant/users.js";
import { ForbiddenError } from "../middleware/errors.js";


// Create Teacher Controller
export async function CreateTeacherController(req: Request<{}, {}, Omit<TeacherProps, "id" | "userId">>, res: Response, next: NextFunction) {
    const {email, firstname, middlename, lastname, suffix} = req.body;
    const teacher = {
        email: NormalizedData(email), 
        firstname: NormalizedData(firstname, true),
        middlename: NormalizedData(middlename, true),
        lastname: NormalizedData(lastname, true), 
        ...(suffix && {suffix: NormalizedData(suffix, true)})
    };

    Validate(teacher);

    try {
        await CreateTeacherService(teacher);
        res.status(201).json(
            SuccessResponse({message: "Teacher created successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Get all teachers controller
export async function getAllTeachersController(_req: Request, res: Response, next: NextFunction) {
    try {
        const teachers = await getAllTeachersService();
        res.status(200).json(
            SuccessResponse({
                message: "Teachers retrieved successfully",
                data: teachers
            })
        );
    }catch(err) {
        next(err);
    }
}


// Update teacher by ID controller
export async function UpdateTeacherController(req: Request<{id: number}, {}, TeacherUpdateProps>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const {email, firstname, middlename, lastname, suffix} = req.body;
    const teacher: TeacherUpdateProps = {
        ...(email !== undefined && { email: NormalizedData(email) }),
        ...(firstname !== undefined && { firstname: NormalizedData(firstname, true) }),
        ...(middlename !== undefined && { middlename: NormalizedData(middlename, true) }),
        ...(lastname !== undefined && { lastname: NormalizedData(lastname, true) }),
        ...(suffix !== undefined && { suffix: suffix ? NormalizedData(suffix, true) : null })
    };

    const validatedFields: Record<string, unknown> = { id };
    for (const field of ["email", "firstname", "middlename", "lastname"] as const) {
        if (teacher[field] !== undefined) {
            validatedFields[field] = teacher[field];
        }
    }
    Validate(validatedFields);

    try {
        // Teachers may only update their own profile; admins may update any.
        if (req.user?.role === ROLES.TEACHER) {
            const existing = await getTeacherByIdService(Number(id));
            if (!existing || existing.userId !== req.user.id) {
                throw new ForbiddenError("You can only update your own profile");
            }
        }

        await updateTeacherService(Number(id), teacher);
        res.status(200).json(
            SuccessResponse({message: "Teacher updated successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Delete teacher by ID controller
export async function DeleteTeacherController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    Validate({id});

    try {
        await deleteTeacherService(Number(id));
        res.status(200).json(
            SuccessResponse({message: "Teacher deleted successfully"})
        );
    }catch(err) {
        next(err);
    }
}

// Get teacher by user ID controller
export async function getTeacherByUserIdController(req: Request<{userId: number}>, res: Response, next: NextFunction) {
    const {userId} = req.params;
    Validate({userId});

    try {
        const teacher = await getTeacherByUserIdService(Number(userId));
        res.status(200).json(
            SuccessResponse({
                message: "Teacher retrieved successfully",
                data: teacher
            })
        );
    }catch(err) {
        next(err);
    }
}

// Get teacher by ID controller
export async function getTeacherByIdController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    Validate({id});

    try {
        const teacher = await getTeacherByIdService(id);
        res.status(200).json(
            SuccessResponse({
                message: "Teacher retrieved successfully",
                data: teacher
            })
        );
    }catch(err) {
        next(err);
    }
}

// Get teachers subject details by teachers ID controller
export async function getTeacherSubjectDetailsByIdController(req: Request<{teacherId: number}>, res: Response, next: NextFunction) {
    const {teacherId} = req.params;
    Validate({teacherId});
    try {
        const teachers = await getTeacherSubjectDetailsTeacherByIdService(Number(teacherId));
        res.status(200).json(
            SuccessResponse({
                message: "Teachers retrieved successfully",
                data: teachers
            })
        );
    }catch(err) {
        next(err);
    }
}