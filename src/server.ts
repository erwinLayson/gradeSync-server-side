import app from "./app.js";

const PORT: number = Number(process.env.DEVELOPMENT_PORT) || 8001; 
const server = app.listen(PORT, () => {
    console.log(`Server is running in PORT: ${PORT}`);
})

server.on("error", (err) => {
    console.log(`Error: ${err}`);
})