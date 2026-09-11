// .puppeteerrc.cjs
// Cache Chrome inside the project directory so it survives Render.com
// free-tier spin-down/cold-start (the default ~/.cache/puppeteer path
// lives outside the deploy snapshot and gets wiped on cold start).
const { join } = require("path");

module.exports = {
    cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
