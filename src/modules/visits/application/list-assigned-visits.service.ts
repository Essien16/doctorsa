import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { AssignedVisit } from "../domain/assigned-visit.js";
import type { VisitRepository } from "../domain/visit.repository.js";

export class ListAssignedVisitsService {
  constructor(
    private readonly visitRepository: VisitRepository,
  ) {}

  async execute(
    doctorUserId: string,
  ): Promise<AssignedVisit[]> {
    const doctorProfile =
      await this.visitRepository.findDoctorProfileByUserId(
        doctorUserId,
      );

    if (!doctorProfile) {
      throw new NotFoundError("Doctor profile");
    }

    return this.visitRepository.listAssignedForDoctorProfile(
      doctorProfile.id,
    );
  }
}