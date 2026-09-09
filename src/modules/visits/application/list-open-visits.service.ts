import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { OpenVisit } from "../domain/open-visit.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export class ListOpenVisitsService {
  constructor(private readonly visitRepository: VisitRepository) {}

  async execute(doctorUserId: string): Promise<OpenVisit[]> {
    const doctorProfile =
      await this.visitRepository.findDoctorProfileByUserId(doctorUserId);

    if (!doctorProfile) {
      throw new NotFoundError("Doctor profile");
    }

    return this.visitRepository.listOpenForSpecialty(doctorProfile.specialtyId);
  }
}
