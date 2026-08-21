import type { Response, Request, NextFunction } from "express";

import type{StudentCreateProps} from "../constant/students.js"

import {
    createStudentService,
    getAllStudentService, 
    getStudentByIdService,
    getAllNotEnrolledStudentsService,
    updateStudentByIdService,
    deleteStudentByIdService
} from "../service/students.js";

// Helpers
import { SuccessResponse } from "../helper/response.js";
import NormalizedData from "../helper/normalizedData.js";
import Validate from "../helper/validate.js";
import { BadRequestError } from "../middleware/errors.js";

export async function createStudentController(req: Request<{}, {}, StudentCreateProps>, res: Response, next: NextFunction) {
    const {userId,lrn, email, firstname, middlename, lastname, suffix, birthdate, sex} = req.body;
    try {
        const student = {
            lrn,
            email:  NormalizedData(email),
            firstname: NormalizedData(firstname, true),
            middlename: NormalizedData(middlename, true),
            lastname: NormalizedData(lastname, true),
            ...(suffix && {suffix: NormalizedData(suffix, true)}),
            birthdate: NormalizedData(birthdate),
            sex: NormalizedData(sex, true)
        };

        // Validate student data
        Validate(student);

        const response =  await createStudentService(student);
        console.log(response)
        return res.status(201).json(
            SuccessResponse(
                {
                    message: `Student create sucessful`,
                }
            )
        )
    }catch(err) {
        next(err);
    }
}

// Get all students controller
export async function getAllStudentController(req: Request, res: Response, next: NextFunction) {
    try { 
        const result = await getAllStudentService();
        return res.status(200).json(
            SuccessResponse({
                message: `Get student successfull`,
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}
// Get student by ID controller
export async function getStudentByIdController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    try { 
        if(!id || isNaN(Number(id))) {
            throw new BadRequestError(`Invalid ID: ${id}`);
        }

        const result = await getStudentByIdService(id);
        return res.status(200).json(
            SuccessResponse({
                message: `Get student successfull`,
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}


// Update student by ID controller
export async function updateStudentController(req: Request<{id: string}, {}, Partial<StudentCreateProps>>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const {lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status} = req.body;

    if(!id || isNaN(Number(id))) {
        return next(new BadRequestError(`Invalid ID: ${id}`));
    }

    const student: Partial<StudentCreateProps> = {
        ...(lrn !== undefined && { lrn }),
        ...(email !== undefined && { email: NormalizedData(email) }),
        ...(firstname !== undefined && { firstname: NormalizedData(firstname, true) }),
        ...(middlename !== undefined && { middlename: NormalizedData(middlename, true) }),
        ...(lastname !== undefined && { lastname: NormalizedData(lastname, true) }),
        ...(suffix !== undefined && { suffix: suffix ? NormalizedData(suffix, true) : null }),
        ...(birthdate !== undefined && { birthdate: NormalizedData(birthdate) }),
        ...(sex !== undefined && { sex: NormalizedData(sex, true) }),
        ...(status !== undefined && { status })
    };

    if (Object.keys(student).length === 0) {
        return next(new BadRequestError("No fields to update"));
    }

    // Validate only the provided fields (suffix can legitimately be null/empty)
    const validatedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(student)) {
        if (value !== null && value !== "") {
            validatedFields[key] = value;
        }
    }
    Validate(validatedFields);

    try {
        await updateStudentByIdService(Number(id), student);
        return res.status(200).json(
            SuccessResponse({
                message: `Student updated successfully`,
            })
        )
    }catch(err) {
        next(err);
    }
}

// Soft delete student by ID controller
export async function deleteStudentController(req: Request<{id: string}>, res: Response, next: NextFunction) {
    const {id} = req.params;

    if(!id || isNaN(Number(id))) {
        return next(new BadRequestError(`Invalid ID: ${id}`));
    }

    try {
        await deleteStudentByIdService(Number(id));
        return res.status(200).json(
            SuccessResponse({
                message: `Student deleted successfully`,
            })
        )
    }catch(err) {
        next(err);
    }
}


// Get all not enrolled students controller
export async function getAllNotEnrolledStudentsController(req: Request, res: Response, next: NextFunction) {
    const searchQuery = req.query.search as string | undefined;
    const schoolYearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : undefined;

    if(searchQuery === null || searchQuery === undefined) {
        return res.status(400).json({
            message: "Missing search query parameter"
        });
    }

    try { 
        const result = await getAllNotEnrolledStudentsService(searchQuery, schoolYearId && !isNaN(schoolYearId) ? schoolYearId : undefined);
        return res.status(200).json(
            SuccessResponse({
                message: `Get not enrolled students successfull`,
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}