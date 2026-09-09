import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { ListOpenVisitsService } from "../application/list-open-visits.service.js";
import type { SubmitBidService } from "../application/submit-bid.service.js";
import { submitBidPageSchema } from "./visit.schemas.js";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

export class DoctorPageController {
  constructor(
    private readonly listOpenVisitsService:
      ListOpenVisitsService,
    private readonly submitBidService:
      SubmitBidService,
  ) {}

  showOpenRequests = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doctorUserId =
        this.getDoctorUserId(request);

      const visits =
        await this.listOpenVisitsService.execute(
          doctorUserId,
        );

      response.status(200).render(
        "doctor/open-requests",
        {
          title: "Open requests",
          successMessage:
            request.query["bid"] === "submitted"
              ? "Your bid was submitted successfully."
              : undefined,
          errorMessage:
            request.query["error"] === "invalid-bid"
              ? "Enter a valid bid amount and note."
              : undefined,
          hasVisits: visits.length > 0,
          visits: visits.map((visit) => ({
            id: visit.id,
            patientName: visit.patientName,
            specialtyName: visit.specialtyName,
            location: visit.location,
            preferredAt: dateFormatter.format(
              visit.preferredAt,
            ),
            status: visit.status,
            statusClass:
              visit.status.toLowerCase(),
          })),
        },
      );
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
      const doctorUserId =
        this.getDoctorUserId(request);

      const visitId = request.params["visitId"];

      if (typeof visitId !== "string") {
        response.status(404).send("Visit not found");
        return;
      }

      const validation = submitBidPageSchema.safeParse(
        request.body,
      );

      if (!validation.success) {
        response.redirect(
          303,
          "/doctor/requests?error=invalid-bid",
        );

        return;
      }

      const amountInKobo = Math.round(
        validation.data.amountInNaira * 100,
      );

      await this.submitBidService.execute({
        doctorUserId,
        visitId,
        amountInKobo,
        note: validation.data.note,
      });

      response.redirect(
        303,
        "/doctor/requests?bid=submitted",
      );
    } catch (error) {
      next(error);
    }
  };

  private getDoctorUserId(
    request: Request,
  ): string {
    const doctorUserId = request.session.userId;

    if (!doctorUserId) {
      throw new AuthenticationError(
        "Authentication required",
      );
    }

    return doctorUserId;
  }
}