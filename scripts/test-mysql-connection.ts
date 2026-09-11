import {
  checkMySqlConnection,
  closeMySqlConnection,
} from "../src/infrastructure/database/mysql.js";

async function main(): Promise<void> {
  try {
    await checkMySqlConnection();
    console.info("MySQL connection successful");
  } finally {
    await closeMySqlConnection();
  }
}

main().catch((error: unknown) => {
  console.error("MySQL connection failed", error);
  process.exitCode = 1;
});
