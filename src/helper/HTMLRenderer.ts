import ejs from "ejs";
import fs from "fs";
import path from "path"


export function HTMLRenderer(
    filename: string, 
    data?: ejs.Data
): string {
    const filePath = path.join(process.cwd(), "src", "view", filename);
    const template = fs.readFileSync(filePath, "utf-8");
    return ejs.render(template, data);
}