import type { PatientVisitSummary } from "../domain/patient-visit-summary.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export class ListPatientVisitsService {
  constructor(
    private readonly visitRepository: VisitRepository,
  ) {}

  execute(
    patientId: string,
  ): Promise<PatientVisitSummary[]> {
    return this.visitRepository.listForPatient(patientId);
  }
}