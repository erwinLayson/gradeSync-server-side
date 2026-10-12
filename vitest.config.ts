import { defineConfig } from "vitest/config";

/**
 * Server test configuration.
 *
 * The suite is DB-backed and runs against a DISPOSABLE database
 * (see test/helpers/testConfig.ts). `globalSetup` provisions that database once
 * per run (base schema + migrations); `setupEnv` repoints the application pool
 * at it before any `src/` module is imported.
 *
 * Files run sequentially (`fileParallelism: false`) because they share a single
 * MySQL schema.
 */
export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        globalSetup: ["./test/globalSetup.ts"],
        setupFiles: ["./test/setupEnv.ts"],
        // One shared MySQL schema -> no cross-file parallelism.
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 180_000,
    },
});
