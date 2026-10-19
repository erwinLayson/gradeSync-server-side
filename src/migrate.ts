import "dotenv/config";

import { runMigrations } from "./migrations/runner.js";

const baseline = process.argv.includes("--baseline");
const fresh = process.argv.includes("--fresh");

runMigrations({ baseline, fresh }).catch((error: unknown) => {
    console.error("\nMIGRATION FAILED:", error instanceof Error ? error.message : error);
    console.error("No record was written for the failed file, so it will be retried on the next run.");
    process.exitCode = 1;
});
