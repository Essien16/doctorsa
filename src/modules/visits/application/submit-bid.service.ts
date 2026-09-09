import { AuthorizationError } from "../../../shared/errors/authorization-error.js";
import { ConflictError } from "../../../shared/errors/conflict-error.js";
import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import { ValidationError } from "../../../shared/errors/validation-error.js";
import type { Bid } from "../domain/bid.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export interface SubmitBidInput {
  visitId: string;
  doctorUserId: string;
  amountInKobo: number;
  note: string;
}

export class SubmitBidService {
  constructor(private readonly visitRepository: VisitRepository) {}

  async execute(input: SubmitBidInput): Promise<Bid> {
    if (!Number.isSafeInteger(input.amountInKobo) || input.amountInKobo <= 0) {
      throw new ValidationError(
        "Bid amount must be a positive integer in kobo",
      );
    }

    const note = input.note.trim();

    if (note.length < 2) {
      throw new ValidationError("Bid note must contain at least 2 characters");
    }

    if (note.length > 280) {
      throw new ValidationError("Bid note cannot exceed 280 characters");
    }

    const result = await this.visitRepository.submitBid({
      visitId: input.visitId,
      doctorUserId: input.doctorUserId,
      amountInKobo: input.amountInKobo,
      note,
    });

    if (result.success) {
      return result.bid;
    }

    switch (result.reason) {
      case "DOCTOR_PROFILE_NOT_FOUND":
        throw new NotFoundError("Doctor profile");

      case "VISIT_NOT_FOUND":
        throw new NotFoundError("Visit");

      case "SPECIALTY_MISMATCH":
        throw new AuthorizationError(
          "You can only bid on visits matching your specialty",
        );

      case "VISIT_NOT_ACCEPTING_BIDS":
        throw new ConflictError("This visit is no longer accepting bids");
    }
  }
}
