import type { VisitStatus } from "./visit-status.js";

export interface PatientVisitSummary {
  id: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: VisitStatus;
  createdAt: Date;
}
