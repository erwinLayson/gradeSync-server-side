import { BadRequestError } from "../middleware/errors.js";

export default function Validate<T extends Object>(data: T) {
    for(const [key, values] of Object.entries(data)) {
            // Check null/undefined BEFORE any String()/toString() coercion — those
            // throw a TypeError on null/undefined, which surfaced as HTTP 500
            // instead of the intended 400 validation error.
            if(values === null || values === undefined || String(values).trim() === "") {
               throw new BadRequestError(`Invalid ${key}`);
            }
        };
}