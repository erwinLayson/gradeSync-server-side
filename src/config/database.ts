import mysql from "mysql2/promise";

import getEnv from "../helper/getEnv.js";

let pool: mysql.Pool | null = null;


export function getDBPoolConnection() {
  if (!pool) {
    pool = mysql.createPool({
      host: getEnv("DB_HOST"),
      user: getEnv("DB_USER"),
      password: getEnv("DB_PASSWORD"),
      database: getEnv("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

export const checkDBConnection = async () => {
  const pool = getDBPoolConnection();
  try { 
    const connection = await pool.getConnection();
    console.log(`DB Connection success`);

    connection.release();
  } catch (err) {
    console.error("DB Connection failed");
    throw err;
  }
}