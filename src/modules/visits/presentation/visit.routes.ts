import { Router } from "express";

import { requireAuthentication } from "../../../middleware/require-authentication.js";
import { requireRole } from "../../../middleware/require-role.js";
import type { VisitController } from "./visit.controller.js";

export function createVisitRouter(controller: VisitController): Router {
  const router = Router();

  router.use(requireAuthentication);

  router.post("/", requireRole("PATIENT"), controller.create);

  router.get("/open", requireRole("DOCTOR"), controller.listOpenVisits);

  router.get("/assigned", requireRole("DOCTOR"), controller.listAssignedVisits);

  router.post("/:visitId/bids", requireRole("DOCTOR"), controller.submitBid);

  router.get("/:visitId", requireRole("PATIENT"), controller.getPatientVisit);

  return router;
}

export function createSpecialtyRouter(controller: VisitController): Router {
  const router = Router();

  router.get("/", requireAuthentication, controller.listSpecialties);

  return router;
}
