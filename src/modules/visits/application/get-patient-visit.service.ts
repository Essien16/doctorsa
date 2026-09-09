import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { PatientVisitDetails } from "../domain/patient-visit-details.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export interface GetPatientVisitInput {
  visitId: string;
  patientId: string;
}

export class GetPatientVisitService {
  constructor(
    private readonly visitRepository: VisitRepository,
  ) {}

  async execute(
    input: GetPatientVisitInput,
  ): Promise<PatientVisitDetails> {
    const visit =
      await this.visitRepository.findPatientVisitDetails(
        input.visitId,
        input.patientId,
      );

    if (!visit) {
      throw new NotFoundError("Visit");
    }

    return visit;
  }
}