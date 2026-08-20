import ejs from "ejs";
import path from "path"


export async function HTMLRenderer<T>(
    filename: string, 
    data?: ejs.Data
) {
    try {
        const html = ejs.renderFile(path.join(process.cwd(), "src",  "view", filename), data);

        return html;
    }catch(err) {
        throw err;
    }
}