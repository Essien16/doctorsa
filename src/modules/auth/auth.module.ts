import { prisma } from "../../infrastructure/database/prisma.js";
import { GetCurrentUserService } from "./application/get-current-user.service.js";
import { LoginService } from "./application/login.service.js";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher.js";
import { PrismaUserRepository } from "./infrastructure/prisma-user.repository.js";
import { AuthController } from "./presentation/auth.controller.js";
import { createAuthRouter } from "./presentation/auth.routes.js";
import { AuthPageController } from "./presentation/auth-page.controller.js";
import { createAuthPageRouter } from "./presentation/auth-page.routes.js";

const userRepository = new PrismaUserRepository(prisma);
const passwordHasher = new BcryptPasswordHasher();

const loginService = new LoginService(
  userRepository,
  passwordHasher,
);

const getCurrentUserService = new GetCurrentUserService(
  userRepository,
);

const authController = new AuthController(
  loginService,
  getCurrentUserService,
);

const authPageController = new AuthPageController(
  loginService,
);

export const authPageRouter =
  createAuthPageRouter(authPageController);

export const authRouter = createAuthRouter(authController);

