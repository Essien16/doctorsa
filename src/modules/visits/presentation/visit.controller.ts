import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { CreateVisitService } from "../application/create-visit.service.js";
import type { ListSpecialtiesService } from "../application/list-specialties.service.js";
import { createVisitRequestSchema,  visitIdParamsSchema, submitBidRequestSchema, } from "./visit.schemas.js";
import type { ListOpenVisitsService } from "../application/list-open-visits.service.js";
import type { SubmitBidService } from "../application/submit-bid.service.js";
import type { GetPatientVisitService } from "../application/get-patient-visit.service.js";
import type { ListAssignedVisitsService } from "../application/list-assigned-visits.service.js";

export class VisitController {
  constructor(
    private readonly createVisitService: CreateVisitService,
    private readonly listSpecialtiesService: ListSpecialtiesService,
    private readonly listOpenVisitsService: ListOpenVisitsService,
    private readonly submitBidService: SubmitBidService,
    private readonly getPatientVisitService: GetPatientVisitService,
    private readonly listAssignedVisitsService: ListAssignedVisitsService,
  ) {}

  listSpecialties = async (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const specialties =
        await this.listSpecialtiesService.execute();

      response.status(200).json({
        specialties,
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.session.userId) {
        throw new AuthenticationError();
      }

      const validation = createVisitRequestSchema.safeParse(
        request.body,
      );

      if (!validation.success) {
        response.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "The visit request is invalid",
            details: validation.error.flatten().fieldErrors,
          },
        });

        return;
      }

      const visit = await this.createVisitService.execute({
        patientId: request.session.userId,
        specialtyId: validation.data.specialtyId,
        location: validation.data.location,
        preferredAt: validation.data.preferredAt,
      });

      response.status(201).json({
        visit,
      });
    } catch (error) {
      next(error);
    }
  };

  listOpenVisits = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!request.session.userId) {
      throw new AuthenticationError();
    }

    const visits = await this.listOpenVisitsService.execute(
      request.session.userId,
    );

    response.status(200).json({
      visits,
    });
  } catch (error) {
    next(error);
  }
};

submitBid = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!request.session.userId) {
      throw new AuthenticationError();
    }

    const paramsValidation = visitIdParamsSchema.safeParse(
      request.params,
    );

    if (!paramsValidation.success) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The visit ID is invalid",
          details:
            paramsValidation.error.flatten().fieldErrors,
        },
      });

      return;
    }

    const bodyValidation = submitBidRequestSchema.safeParse(
      request.body,
    );

    if (!bodyValidation.success) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The bid details are invalid",
          details:
            bodyValidation.error.flatten().fieldErrors,
        },
      });

      return;
    }

    const bid = await this.submitBidService.execute({
      visitId: paramsValidation.data.visitId,
      doctorUserId: request.session.userId,
      amountInKobo: bodyValidation.data.amountInKobo,
      note: bodyValidation.data.note,
    });

    response.status(200).json({
      bid,
    });
  } catch (error) {
    next(error);
  }
};

getPatientVisit = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!request.session.userId) {
      throw new AuthenticationError();
    }

    const validation = visitIdParamsSchema.safeParse(
      request.params,
    );

    if (!validation.success) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The visit ID is invalid",
          details: validation.error.flatten().fieldErrors,
        },
      });

      return;
    }

    const visit = await this.getPatientVisitService.execute({
      visitId: validation.data.visitId,
      patientId: request.session.userId,
    });

    response.status(200).json({
      visit,
    });
  } catch (error) {
    next(error);
  }
};

listAssignedVisits = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!request.session.userId) {
      throw new AuthenticationError();
    }

    const visits =
      await this.listAssignedVisitsService.execute(
        request.session.userId,
      );

    response.status(200).json({
      visits,
    });
  } catch (error) {
    next(error);
  }
};
}