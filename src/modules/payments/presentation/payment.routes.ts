import { Router } from "express";

import { requireRole } from "../../../middleware/require-role.js";
import type { PaymentController } from "./payment.controller.js";

export function createPaymentSelectionRouter(
  controller: PaymentController,
): Router {
  const router = Router();

  router.post(
    "/:visitId/bids/:bidId/select",
    requireRole("PATIENT"),
    controller.selectBid,
  );

  return router;
}