import {
  closeMySqlConnection,
  mysqlPool,
} from "../src/infrastructure/database/mysql.js";
import { MySqlUserRepository } from "../src/modules/auth/infrastructure/mysql-user.repository.js";

async function main(): Promise<void> {
  const repository = new MySqlUserRepository(mysqlPool);

  const loginUser = await repository.findByEmail("patient@example.com");

  if (!loginUser) {
    throw new Error("Seeded patient was not found in MySQL");
  }

  const publicUser = await repository.findPublicById(loginUser.id);

  if (!publicUser) {
    throw new Error("Could not retrieve the public patient");
  }

  console.info("MySQL authentication repository works");
  console.info({
    id: publicUser.id,
    name: publicUser.name,
    email: publicUser.email,
    role: publicUser.role,
  });
}

main()
  .catch((error: unknown) => {
    console.error("MySQL authentication repository test failed", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMySqlConnection();
  });
