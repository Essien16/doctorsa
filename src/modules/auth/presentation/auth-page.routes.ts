import { Router } from "express";

import type { AuthPageController } from "./auth-page.controller.js";
import { requireAuthentication } from "../../../middleware/require-authentication.js";

export function createAuthPageRouter(controller: AuthPageController): Router {
  const router = Router();

  router.get("/login", controller.showLoginPage);
  router.post("/login", controller.login);
  router.post("/logout", requireAuthentication, controller.logout);

  return router;
}
