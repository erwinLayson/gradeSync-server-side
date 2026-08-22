/**
 * Migration: Create class_daily_attendance table
 *
 * This table stores class-level (adviser) attendance records, separate from
 * the per-subject student_attendance table. The adviser's attendance is the
 * authoritative source for the student card / report card.
 *
 * Usage:  node migrate_class_daily_attendance.mjs
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log(`Connected to ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);

  // ── 1. Create the table ──────────────────────────────────────────────
  console.log("Creating class_daily_attendance table...");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS class_daily_attendance (
      id            BIGINT(20)   NOT NULL AUTO_INCREMENT,
      classId       INT(11)      NOT NULL,
      enrollmentId  BIGINT(20)   NOT NULL,
      date          DATE         NOT NULL,
      status        ENUM('present','absent') DEFAULT NULL,
      quarter       TINYINT(4)   NOT NULL DEFAULT 1,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_class_attendance_once (classId, enrollmentId, date),
      KEY fk_class_attendance_enrollment (enrollmentId),
      KEY fk_class_attendance_class (classId),
      KEY idx_class_attendance_quarter (quarter),
      CONSTRAINT fk_class_attendance_enrollment
        FOREIGN KEY (enrollmentId) REFERENCES enrollments (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_class_attendance_class
        FOREIGN KEY (classId) REFERENCES classrooms (id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  console.log("✅ class_daily_attendance table created successfully.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
