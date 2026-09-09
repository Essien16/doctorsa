import { Router } from "express";

import { requireAuthentication } from "../../../middleware/require-authentication.js";
import { requireRole } from "../../../middleware/require-role.js";
import type { PaymentPageController } from "./payment-page.controller.js";

export function createPaymentPageRouter(
  controller: PaymentPageController,
): Router {
  const router = Router();

  router.post(
    "/patient/visits/:visitId/bids/:bidId/select",
    requireAuthentication,
    requireRole("PATIENT"),
    controller.selectBid,
  );

  router.get(
    "/mock-payments/:paymentId",
    requireAuthentication,
    requireRole("PATIENT"),
    controller.showCheckout,
  );

  return router;
}