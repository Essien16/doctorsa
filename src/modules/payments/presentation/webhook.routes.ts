import { Router } from "express";

import type { WebhookController } from "./webhook.controller.js";

export function createPaymentWebhookRouter(
  controller: WebhookController,
): Router {
  const router = Router();

  router.post("/", controller.handle);

  return router;
}
