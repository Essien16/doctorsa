import { Router } from "express";

import { requireAuthentication } from "../../../middleware/require-authentication.js";
import { requireRole } from "../../../middleware/require-role.js";
import type { PatientPageController } from "./patient-page.controller.js";

const patientOnly = [requireAuthentication, requireRole("PATIENT")] as const;

export function createPatientPageRouter(
  controller: PatientPageController,
): Router {
  const router = Router();

  router.get("/patient/visits/new", ...patientOnly, controller.showCreateVisit);

  router.post("/patient/visits", ...patientOnly, controller.createVisit);

  router.get("/patient/visits", ...patientOnly, controller.showVisits);

  router.get(
    "/patient/visits/:visitId",
    ...patientOnly,
    controller.showVisitDetails,
  );

  return router;
}
