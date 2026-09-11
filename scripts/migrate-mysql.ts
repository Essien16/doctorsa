import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import mysql, { type RowDataPacket } from "mysql2/promise";

import { env } from "../src/config/env.js";

interface MigrationRow extends RowDataPacket {
  checksum: string;
}

interface MigrationLockRow extends RowDataPacket {
  acquired: number | null;
}

function parseConnectionOptions(connectionUrl: string) {
  const url = new URL(connectionUrl);

  if (url.protocol !== "mysql:") {
    throw new Error("MYSQL_DATABASE_URL must use the mysql protocol");
  }

  const database = url.pathname.slice(1);

  if (!database) {
    throw new Error("MYSQL_DATABASE_URL must include a database name");
  }

  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

async function migrate(): Promise<void> {
  const connection = await mysql.createConnection({
    ...parseConnectionOptions(env.MYSQL_DATABASE_URL),

    multipleStatements: true,
    timezone: "Z",
    charset: "utf8mb4",
  });

  await connection.query("SET SESSION time_zone = '+00:00'");

  let migrationLockAcquired = false;

  try {
    const [lockRows] = await connection.execute<MigrationLockRow[]>(
      `
          SELECT GET_LOCK(?, 30) AS acquired
        `,
      ["doctorsa:mysql:migrations"],
    );

    migrationLockAcquired = lockRows[0]?.acquired === 1;

    if (!migrationLockAcquired) {
      throw new Error("Could not acquire the database migration lock");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) NOT NULL,
        checksum CHAR(64) CHARACTER SET ascii
          COLLATE ascii_bin NOT NULL,
        applied_at DATETIME(3) NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3),

        PRIMARY KEY (name)
      ) ENGINE=InnoDB
        DEFAULT CHARACTER SET=utf8mb4
        COLLATE=utf8mb4_0900_ai_ci
    `);

    const migrationsDirectory = path.resolve(
      process.cwd(),
      "database/migrations",
    );

    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const migrationName of migrationNames) {
      const migrationPath = path.join(migrationsDirectory, migrationName);

      const migrationSql = await readFile(migrationPath, "utf8");

      const checksum = createHash("sha256").update(migrationSql).digest("hex");

      const [existingRows] = await connection.execute<MigrationRow[]>(
        `
            SELECT checksum
            FROM schema_migrations
            WHERE name = ?
            LIMIT 1
          `,
        [migrationName],
      );

      const existingMigration = existingRows[0];

      if (existingMigration) {
        if (existingMigration.checksum !== checksum) {
          throw new Error(
            `Migration ${migrationName} was modified after it was applied`,
          );
        }

        console.info(`Already applied: ${migrationName}`);

        continue;
      }

      console.info(`Applying: ${migrationName}`);

      await connection.query(migrationSql);

      await connection.execute(
        `
          INSERT INTO schema_migrations (
            name,
            checksum
          )
          VALUES (?, ?)
        `,
        [migrationName, checksum],
      );

      console.info(`Applied: ${migrationName}`);
    }

    console.info("MySQL migrations are up to date");
  } finally {
    if (migrationLockAcquired) {
      await connection.execute("SELECT RELEASE_LOCK(?)", [
        "doctorsa:mysql:migrations",
      ]);
    }

    await connection.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("MySQL migration failed", error);
  process.exitCode = 1;
});
