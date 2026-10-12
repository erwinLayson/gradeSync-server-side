// `dotenv/config` MUST be the first import: ESM evaluates imports in order, and
// the app reads DB_* via getEnv() at pool-creation time.
import "dotenv/config";

import { assertSafeTestDatabase, getTestDbName } from "./helpers/testConfig.js";

/**
 * Runs once per test file, BEFORE the test file's imports are evaluated, so the
 * application pool (src/config/database.ts, created lazily on first use) points
 * at the disposable test database instead of the developer database.
 */
assertSafeTestDatabase();

process.env.DB_NAME = getTestDbName();
process.env.NODE_ENV = "test";
