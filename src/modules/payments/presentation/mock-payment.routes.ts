import { Router } from "express";

import { requireRole } from "../../../middleware/require-role.js";
import type { MockPaymentController } from "./mock-payment.controller.js";

export function createMockPaymentRouter(
  controller: MockPaymentController,
): Router {
  const router = Router();

  router.post(
    "/:paymentId/confirm",
    requireRole("PATIENT"),
    controller.confirm,
  );

  return router;
}
