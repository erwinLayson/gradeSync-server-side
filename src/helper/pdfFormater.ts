import puppeteer from "puppeteer";

interface PDFFormat {
    width: string,
    height: string,
}   

export async function pdfFormatter(html: string, pdfFormat: PDFFormat, landScape: boolean) {
    const browser = await puppeteer.launch({headless: true});

    try {
        const pages = await browser.newPage();

        await pages.setContent(html, {
            waitUntil: "load"
        });

        const pdfFile = await pages.pdf({
            width: `${pdfFormat.width}`,
            height: `${pdfFormat.height}`,
            landscape: landScape,
            printBackground: true
        });

        return pdfFile
    }catch(err ) {
        throw err;
    }
}