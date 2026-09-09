import { Router } from "express";

import { requireAuthentication } from "../../../middleware/require-authentication.js";
import { requireRole } from "../../../middleware/require-role.js";
import type { DoctorPageController } from "./doctor-page.controller.js";

export function createDoctorPageRouter(
  controller: DoctorPageController,
): Router {
  const router = Router();

  router.get(
    "/doctor/requests",
    requireAuthentication,
    requireRole("DOCTOR"),
    controller.showOpenRequests,
  );

  router.post(
    "/doctor/requests/:visitId/bids",
    requireAuthentication,
    requireRole("DOCTOR"),
    controller.submitBid,
  );

  router.get(
    "/doctor/assigned-visits",
    requireAuthentication,
    requireRole("DOCTOR"),
    controller.showAssignedVisits,
  );

  return router;
}
