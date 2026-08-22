import { getDBPoolConnection } from "../config/database.js";
import SubjectComponentsModel from "../model/subjectComponents.js";
import type { PoolConnection } from "mysql2/promise";
import { BadRequestError, ConflictError, NotFoundError } from "../middleware/errors.js";
import type { SubjectComponent, ComponentCreateProps, ComponentUpdateProps } from "../constant/subjectComponents.js";

// Get all components for a subject
export async function getSubjectComponentsService(parentSubjectId: number): Promise<SubjectComponent[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);
        return await model.getSubjectComponents(parentSubjectId);
    } finally {
        connection.release();
    }
}

// Get components for a subject (with connection reuse)
export async function getSubjectComponentsWithConnection(
    parentSubjectId: number,
    connection: PoolConnection
): Promise<SubjectComponent[]> {
    const model = new SubjectComponentsModel(connection);
    return await model.getSubjectComponents(parentSubjectId);
}

// Create a single component
export async function createComponentService(
    parentSubjectId: number,
    data: ComponentCreateProps
): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);

        // Validate weight is positive
        if (data.weight <= 0 || data.weight > 100) {
            throw new BadRequestError("Component weight must be between 0 and 100");
        }

        // Check total weight doesn't exceed 100
        const currentTotal = await model.getTotalWeight(parentSubjectId);
        if (currentTotal + data.weight > 100) {
            throw new BadRequestError(
                `Total component weight cannot exceed 100%. Current: ${currentTotal}%, Adding: ${data.weight}%`
            );
        }

        return await model.createComponent({ ...data, parentSubjectId });
    } finally {
        connection.release();
    }
}

// Batch create components (used during subject creation)
export async function createComponentsBatchService(
    parentSubjectId: number,
    components: ComponentCreateProps[]
): Promise<number[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);

        // Validate total weight equals 100
        const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
        if (Math.abs(totalWeight - 100) > 0.01) {
            throw new BadRequestError(`Total component weight must equal 100%. Got: ${totalWeight}%`);
        }

        // Validate each weight is positive
        for (const comp of components) {
            if (comp.weight <= 0 || comp.weight > 100) {
                throw new BadRequestError(`Component "${comp.name}" weight must be between 0 and 100`);
            }
        }

        return await model.createComponentsBatch(parentSubjectId, components);
    } finally {
        connection.release();
    }
}

// Update a component
export async function updateComponentService(
    componentId: number,
    data: ComponentUpdateProps
): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);

        const existing = await model.getComponentById(componentId);
        if (!existing) {
            throw new NotFoundError(`Component with ID ${componentId} not found`, 404);
        }

        // If updating weight, validate total
        if (data.weight !== undefined) {
            if (data.weight <= 0 || data.weight > 100) {
                throw new BadRequestError("Component weight must be between 0 and 100");
            }

            const currentTotal = await model.getTotalWeight(existing.parentSubjectId);
            const newTotal = currentTotal - existing.weight + data.weight;
            if (Math.abs(newTotal - 100) > 0.01) {
                throw new BadRequestError(
                    `Total component weight must equal 100%. Would become: ${newTotal}%`
                );
            }
        }

        await model.updateComponent(componentId, data);
    } finally {
        connection.release();
    }
}

// Delete a component
export async function deleteComponentService(componentId: number): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);

        const existing = await model.getComponentById(componentId);
        if (!existing) {
            throw new NotFoundError(`Component with ID ${componentId} not found`, 404);
        }

        // Check if this is the last component
        const components = await model.getSubjectComponents(existing.parentSubjectId);
        if (components.length <= 1) {
            throw new ConflictError(
                "Cannot delete the last component. A subject must have at least one component, or disable components entirely."
            );
        }

        await model.deleteComponent(componentId);
    } finally {
        connection.release();
    }
}

// Check if a subject has components
export async function subjectHasComponentsService(subjectId: number): Promise<boolean> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SubjectComponentsModel(connection);
        return await model.hasComponents(subjectId);
    } finally {
        connection.release();
    }
}
