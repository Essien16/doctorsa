import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { CreateVisitService } from "../application/create-visit.service.js";
import type { GetPatientVisitService } from "../application/get-patient-visit.service.js";
import type { ListPatientVisitsService } from "../application/list-patient-visits.service.js";
import type { ListSpecialtiesService } from "../application/list-specialties.service.js";
import { createVisitPageSchema } from "./visit.schemas.js";
import { ConflictError } from "../../../shared/errors/conflict-error.js";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
});

interface CreateVisitPageData {
  errorMessage?: string;
  values?: {
    specialtyId?: string;
    location?: string;
    preferredAt?: string;
  };
  fieldErrors?: {
    specialtyId?: string[];
    location?: string[];
    preferredAt?: string[];
  };
}

export class PatientPageController {
  constructor(
    private readonly listPatientVisitsService:
      ListPatientVisitsService,
    private readonly listSpecialtiesService:
      ListSpecialtiesService,
    private readonly createVisitService:
      CreateVisitService,
    private readonly getPatientVisitService:
      GetPatientVisitService,
  ) {}

  showVisits = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const patientId = this.getPatientId(request);

      const visits =
        await this.listPatientVisitsService.execute(
          patientId,
        );

      response.status(200).render("patient/visits", {
        title: "My visits",
        hasVisits: visits.length > 0,
        visits: visits.map((visit) => ({
          id: visit.id,
          specialtyName: visit.specialtyName,
          location: visit.location,
          preferredAt: dateFormatter.format(
            visit.preferredAt,
          ),
          status: visit.status,
          statusClass: visit.status.toLowerCase(),
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  showCreateVisit = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      this.getPatientId(request);

      await this.renderCreateVisitPage(response, 200);
    } catch (error) {
      next(error);
    }
  };

  createVisit = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const patientId = this.getPatientId(request);

    const validation = createVisitPageSchema.safeParse(
      request.body,
    );

    if (!validation.success) {
      await this.renderCreateVisitPage(response, 400, {
        errorMessage:
          "Please correct the highlighted information.",
        values: request.body,
        fieldErrors:
          validation.error.flatten().fieldErrors,
      });

      return;
    }

    /*
      * datetime-local does not contain a timezone.
      * This task currently interprets it as Lagos time.
      * Nigeria uses UTC+01:00 throughout the year.
     */
    const preferredAt = new Date(
      `${validation.data.preferredAt}:00+01:00`,
    );

    if (
      Number.isNaN(preferredAt.getTime()) ||
      preferredAt <= new Date()
    ) {
      await this.renderCreateVisitPage(response, 400, {
        errorMessage:
          "Preferred time must be in the future.",
        values: validation.data,
        fieldErrors: {
          preferredAt: [
            "Select a date and time in the future.",
          ],
        },
      });

      return;
    }

    try {
      await this.createVisitService.execute({
        patientId,
        specialtyId:
          validation.data.specialtyId,
        location: validation.data.location,
        preferredAt,
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        await this.renderCreateVisitPage(
          response,
          409,
          {
            errorMessage:
              "This appointment overlaps another visit on your schedule.",
            values: validation.data,
            fieldErrors: {
              preferredAt: [
                "Choose a time at least one hour after your other visit.",
              ],
            },
          },
        );

        return;
      }

      throw error;
    }

    response.redirect(303, "/patient/visits");
  } catch (error) {
    next(error);
  }
};

  showVisitDetails = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const patientId = this.getPatientId(request);
      const visitId = request.params["visitId"];

      if (
        typeof visitId !== "string" ||
        visitId.trim().length === 0
      ) {
        response.status(404).send("Visit not found");
        return;
      }

      const visit =
        await this.getPatientVisitService.execute({
          visitId,
          patientId,
        });

      response.status(200).render(
        "patient/visit-details",
        {
          title: visit.specialtyName,

          visit: {
            id: visit.id,
            specialtyName: visit.specialtyName,
            location: visit.location,
            preferredAt: dateFormatter.format(
              visit.preferredAt,
            ),
            status: visit.status,
            statusClass:
              visit.status.toLowerCase(),
            assignedDoctorName:
              visit.assignedDoctorName,
          },

          pendingPayment:
            visit.payment?.status === "PENDING"
              ? {
                  id: visit.payment.id,
                }
              : null,

          hasBids: visit.bids.length > 0,

          bids: visit.bids.map((bid) => ({
            id: bid.id,
            visitId: visit.id,
            doctorName: bid.doctorName,
            amount: currencyFormatter.format(
              bid.amountInKobo / 100,
            ),
            note: bid.note,
            submittedAt: dateFormatter.format(
              bid.createdAt,
            ),
            selected:
              visit.selectedBidId === bid.id,
            canSelect:
              visit.status === "BIDDING" &&
              visit.selectedBidId === null,
          })),
        },
      );
    } catch (error) {
      next(error);
    }
  };

  private getPatientId(request: Request): string {
    const patientId = request.session.userId;

    if (!patientId) {
      throw new AuthenticationError(
        "Authentication required",
      );
    }

    return patientId;
  }

  private async renderCreateVisitPage(
    response: Response,
    status: number,
    data: CreateVisitPageData = {},
  ): Promise<void> {
    const specialties =
      await this.listSpecialtiesService.execute();

    response.status(status).render(
      "patient/new-visit",
      {
        title: "Request a visit",
        errorMessage: data.errorMessage,
        location: data.values?.location ?? "",
        preferredAt:
          data.values?.preferredAt ?? "",
        specialtyError:
          data.fieldErrors?.specialtyId?.[0],
        locationError:
          data.fieldErrors?.location?.[0],
        preferredAtError:
          data.fieldErrors?.preferredAt?.[0],
        specialties: specialties.map(
          (specialty) => ({
            id: specialty.id,
            name: specialty.name,
            selected:
              specialty.id ===
              data.values?.specialtyId,
          }),
        ),
      },
    );
  }
}