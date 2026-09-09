import { prisma } from "../../infrastructure/database/prisma.js";
import { CreateVisitService } from "./application/create-visit.service.js";
import { ListSpecialtiesService } from "./application/list-specialties.service.js";
import { PrismaVisitRepository } from "./infrastructure/prisma-visit.repository.js";
import { VisitController } from "./presentation/visit.controller.js";
import {
  createSpecialtyRouter,
  createVisitRouter,
} from "./presentation/visit.routes.js";
import { ListOpenVisitsService } from "./application/list-open-visits.service.js";
import { SubmitBidService } from "./application/submit-bid.service.js";
import { GetPatientVisitService } from "./application/get-patient-visit.service.js";
import { ListAssignedVisitsService } from "./application/list-assigned-visits.service.js";
import { ListPatientVisitsService } from "./application/list-patient-visits.service.js";
import { PatientPageController } from "./presentation/patient-page.controller.js";
import { createPatientPageRouter } from "./presentation/patient-page.routes.js";
import { DoctorPageController } from "./presentation/doctor-page.controller.js";
import { createDoctorPageRouter } from "./presentation/doctor-page.routes.js";

const visitRepository = new PrismaVisitRepository(prisma);

const createVisitService = new CreateVisitService(visitRepository);

const listSpecialtiesService = new ListSpecialtiesService(visitRepository);

const listOpenVisitsService = new ListOpenVisitsService(visitRepository);

const submitBidService = new SubmitBidService(visitRepository);

const getPatientVisitService = new GetPatientVisitService(visitRepository);

const listAssignedVisitsService = new ListAssignedVisitsService(
  visitRepository,
);

const visitController = new VisitController(
  createVisitService,
  listSpecialtiesService,
  listOpenVisitsService,
  submitBidService,
  getPatientVisitService,
  listAssignedVisitsService,
);

const listPatientVisitsService = new ListPatientVisitsService(visitRepository);

const patientPageController = new PatientPageController(
  listPatientVisitsService,
  listSpecialtiesService,
  createVisitService,
  getPatientVisitService,
);

const doctorPageController = new DoctorPageController(
  listOpenVisitsService,
  submitBidService,
  listAssignedVisitsService,
);

export const visitRouter = createVisitRouter(visitController);

export const specialtyRouter = createSpecialtyRouter(visitController);

export const patientPageRouter = createPatientPageRouter(patientPageController);

export const doctorPageRouter = createDoctorPageRouter(doctorPageController);
