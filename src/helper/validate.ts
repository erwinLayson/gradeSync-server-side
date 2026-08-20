import { BadRequestError } from "../middleware/errors.js";

export default function Validate<T extends Object>(data: T) {
    for(const [key, values] of Object.entries(data)) {
            if(values.toString().trim() === "" || values === null || values === undefined) {
               throw new BadRequestError(`Invalid ${key}`);
            }
        };
}