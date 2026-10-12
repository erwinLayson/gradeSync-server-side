import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { getDBPoolConnection } from "../../src/config/database.js";

/** Parameter type accepted by mysql2's execute(). */
type SqlParam = string | number | boolean | Date | null;

/**
 * A connection from the application pool. setupEnv has already pointed the pool
 * at the disposable test database, so this exercises the real model/service
 * code paths against that database.
 */
export async function getTestConnection(): Promise<PoolConnection> {
    return getDBPoolConnection().getConnection();
}

/** INSERT helper returning the new row id. */
export async function insert(
    connection: PoolConnection,
    sql: string,
    params: SqlParam[]
): Promise<number> {
    const [result] = await connection.execute<ResultSetHeader>(sql, params);
    return result.insertId;
}

/** SELECT helper returning rows. */
export async function select<T = RowDataPacket>(
    connection: PoolConnection,
    sql: string,
    params: SqlParam[] = []
): Promise<T[]> {
    const [rows] = await connection.execute<RowDataPacket[]>(sql, params);
    return rows as T[];
}

/** Single scalar COUNT(*) helper. */
export async function count(
    connection: PoolConnection,
    sql: string,
    params: SqlParam[] = []
): Promise<number> {
    const rows = await select<{ cnt: number | string }>(connection, sql, params);
    return Number(rows[0]?.cnt ?? 0);
}
