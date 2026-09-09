import { Router } from "express";

import { requireAuthentication } from "../../../middleware/require-authentication.js";
import type { AuthController } from "./auth.controller.js";

export function createAuthRouter(
  controller: AuthController,
): Router {
  const router = Router();

  router.post("/login", controller.login);

  router.get(
    "/me",
    requireAuthentication,
    controller.currentUser,
  );

  router.post(
    "/logout",
    requireAuthentication,
    controller.logout,
  );

  return router;
}