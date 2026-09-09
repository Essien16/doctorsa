import { ConflictError } from "../../../shared/errors/conflict-error.js";
import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import { ValidationError } from "../../../shared/errors/validation-error.js";
import type { VisitRepository } from "../domain/visit.repository.js";
import type { Visit } from "../domain/visit.js";

export interface CreateVisitInput {
  patientId: string;
  specialtyId: string;
  location: string;
  preferredAt: Date;
}

type Clock = () => Date;

export class CreateVisitService {
  constructor(
    private readonly visitRepository:
      VisitRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(
    input: CreateVisitInput,
  ): Promise<Visit> {
    const location = input.location.trim();

    if (location.length < 2) {
      throw new ValidationError(
        "Location must contain at least 2 characters",
      );
    }

    if (Number.isNaN(input.preferredAt.getTime())) {
      throw new ValidationError(
        "Preferred time is invalid",
      );
    }

    if (input.preferredAt <= this.clock()) {
      throw new ValidationError(
        "Preferred time must be in the future",
      );
    }

    const specialtyExists =
      await this.visitRepository.specialtyExists(
        input.specialtyId,
      );

    if (!specialtyExists) {
      throw new NotFoundError("Specialty");
    }

    const result =
      await this.visitRepository.create({
        patientId: input.patientId,
        specialtyId: input.specialtyId,
        location,
        preferredAt: input.preferredAt,
      });

    if (!result.success) {
      throw new ConflictError(
        "You already have a visit scheduled during this time",
      );
    }

    return result.visit;
  }
}