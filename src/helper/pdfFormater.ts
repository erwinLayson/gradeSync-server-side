import puppeteer from "puppeteer";

interface PDFFormat {
    width: string,
    height: string,
}   

export async function pdfFormatter(html: string, pdfFormat: PDFFormat, landScape: boolean) {
    const browser = await puppeteer.launch({headless: true});

    try {
        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: "load"
        });

        const pdfFile = await page.pdf({
            width: `${pdfFormat.width}`,
            height: `${pdfFormat.height}`,
            landscape: landScape,
            printBackground: true
        });

        return pdfFile
    } finally {
        await browser.close();
    }
}