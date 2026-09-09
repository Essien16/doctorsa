import type { Bid } from "./bid.js";
import type { DoctorProfile } from "./doctor-profile.js";
import type { OpenVisit } from "./open-visit.js";
import type { Specialty } from "./specialty.js";
import type { Visit } from "./visit.js";
import type { PatientVisitDetails } from "./patient-visit-details.js";
import type { AssignedVisit } from "./assigned-visit.js";
import type { PatientVisitSummary } from "./patient-visit-summary.js";

export interface CreateVisitData {
  patientId: string;
  specialtyId: string;
  location: string;
  preferredAt: Date;
}

export interface SubmitBidData {
  visitId: string;
  doctorUserId: string;
  amountInKobo: number;
  note: string;
}

export type SubmitBidFailureReason =
  | "DOCTOR_PROFILE_NOT_FOUND"
  | "VISIT_NOT_FOUND"
  | "SPECIALTY_MISMATCH"
  | "VISIT_NOT_ACCEPTING_BIDS";

export type SubmitBidResult =
  | {
      success: true;
      bid: Bid;
    }
  | {
      success: false;
      reason: SubmitBidFailureReason;
    };

export interface VisitRepository {
  specialtyExists(specialtyId: string): Promise<boolean>;

  listSpecialties(): Promise<Specialty[]>;

  findDoctorProfileByUserId(
    userId: string,
  ): Promise<DoctorProfile | null>;

  listOpenForSpecialty(
    specialtyId: string,
  ): Promise<OpenVisit[]>;

  create(data: CreateVisitData): Promise<Visit>;

  submitBid(
    data: SubmitBidData,
  ): Promise<SubmitBidResult>;

  findPatientVisitDetails(
  visitId: string,
  patientId: string,
): Promise<PatientVisitDetails | null>;

listAssignedForDoctorProfile(
  doctorProfileId: string,
): Promise<AssignedVisit[]>;

listForPatient(
  patientId: string,
): Promise<PatientVisitSummary[]>;
}