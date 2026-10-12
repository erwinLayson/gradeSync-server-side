/**
 * Shared test-database configuration.
 *
 * IMPORTANT: this module must not read `process.env` at module scope. ESM
 * evaluates imported modules before the importing module's body, so a
 * module-level read would run BEFORE `dotenv.config()`. All accessors below are
 * functions, called after dotenv has loaded.
 *
 * It also must not import anything from `src/` — it is loaded before the
 * application pool is created.
 *
 * SAFETY: the suite inserts and deletes rows, so the database name is forced to
 * a dedicated `*_test` database and we refuse to run when it collides with the
 * name configured in .env.
 */

export function getTestDbName(): string {
    const fromEnv = process.env.TEST_DB_NAME;
    return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : "gradesync_test_phase1";
}

export function getConfiguredDbName(): string {
    return process.env.DB_NAME ?? "gradesync";
}

/**
 * Throws when the test target is not a dedicated test database, or when it
 * collides with the database configured in .env. Called from both globalSetup
 * (provisioning) and setupEnv (per test file) so a misconfiguration can never
 * reach a real database.
 */
export function assertSafeTestDatabase(): void {
    const testDb = getTestDbName();
    const devDb = getConfiguredDbName();

    if (!/_test/.test(testDb)) {
        throw new Error(
            `Refusing to run tests: TEST_DB_NAME "${testDb}" is not a *_test database. ` +
            `The suite mutates data and requires a disposable database.`
        );
    }
    if (testDb === devDb) {
        throw new Error(
            `Refusing to run tests: TEST_DB_NAME equals DB_NAME ("${devDb}"). ` +
            `Point the tests at a separate disposable database.`
        );
    }
}

export function getDbConnectionOptions() {
    return {
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? "root",
        password: process.env.DB_PASSWORD ?? "",
    };
}
