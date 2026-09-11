import { mysqlPool } from "../../infrastructure/database/mysql.js";
import { GetCurrentUserService } from "./application/get-current-user.service.js";
import { LoginService } from "./application/login.service.js";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher.js";
import { MySqlUserRepository } from "./infrastructure/mysql-user.repository.js";
import { AuthPageController } from "./presentation/auth-page.controller.js";
import { createAuthPageRouter } from "./presentation/auth-page.routes.js";
import { AuthController } from "./presentation/auth.controller.js";
import { createAuthRouter } from "./presentation/auth.routes.js";

const userRepository = new MySqlUserRepository(mysqlPool);
const passwordHasher = new BcryptPasswordHasher();

const loginService = new LoginService(userRepository, passwordHasher);

const getCurrentUserService = new GetCurrentUserService(userRepository);

const authController = new AuthController(loginService, getCurrentUserService);

const authPageController = new AuthPageController(loginService);

export const authPageRouter = createAuthPageRouter(authPageController);

export const authRouter = createAuthRouter(authController);
