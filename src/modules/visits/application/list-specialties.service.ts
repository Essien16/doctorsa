import type { Specialty } from "../domain/specialty.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export class ListSpecialtiesService {
  constructor(
    private readonly visitRepository: VisitRepository,
  ) {}

  execute(): Promise<Specialty[]> {
    return this.visitRepository.listSpecialties();
  }
}