import type { VisitStatus } from "./visit-status.js";

export interface Visit {
  id: string;
  patientId: string;
  specialtyId: string;
  selectedBidId: string | null;
  assignedDoctorProfileId: string | null;
  location: string;
  preferredAt: Date;
  status: VisitStatus;
  createdAt: Date;
  updatedAt: Date;
}
