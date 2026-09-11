import mysql, { type Pool } from "mysql2/promise";

import { env } from "../../config/env.js";

function createDatabasePool(connectionUrl: string): Pool {
  const url = new URL(connectionUrl);

  if (url.protocol !== "mysql:") {
    throw new Error("MYSQL_DATABASE_URL must use the mysql protocol");
  }

  const databaseName = url.pathname.slice(1);

  if (!databaseName) {
    throw new Error("MYSQL_DATABASE_URL must include a database name");
  }

  const port = url.port ? Number.parseInt(url.port, 10) : 3306;

  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error("MYSQL_DATABASE_URL contains an invalid port");
  }

  const pool = mysql.createPool({
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,

    charset: "utf8mb4",
    timezone: "Z",

    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  pool.pool.on("connection", (connection) => {
    connection.query("SET SESSION time_zone = '+00:00'", (error) => {
      if (error) {
        connection.destroy();
      }
    });
  });

  return pool;
}

export const mysqlPool = createDatabasePool(env.MYSQL_DATABASE_URL);

export async function checkMySqlConnection(): Promise<void> {
  await mysqlPool.query("SELECT 1");
}

export async function closeMySqlConnection(): Promise<void> {
  await mysqlPool.end();
}
