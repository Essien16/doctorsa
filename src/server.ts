import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeMySqlConnection } from "./infrastructure/database/mysql.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.info(`DoctorSA is running on http://localhost:${env.PORT}`);
});

let shuttingDown = false;

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.info(`${signal} received. Shutting down...`);

  try {
    await closeHttpServer();
    await closeMySqlConnection();

    console.info("DoctorSA shut down successfully.");
  } catch (error: unknown) {
    console.error("DoctorSA failed to shut down cleanly:", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
