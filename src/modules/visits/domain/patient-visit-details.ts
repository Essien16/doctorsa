import type { VisitStatus } from "./visit-status.js";

export type PatientPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface PatientBid {
  id: string;
  doctorName: string;
  amountInKobo: number;
  note: string;
  createdAt: Date;
}

export interface PatientPayment {
  id: string;
  status: PatientPaymentStatus;
}

export interface PatientVisitDetails {
  id: string;
  patientId: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: VisitStatus;
  selectedBidId: string | null;
  assignedDoctorName: string | null;
  payment: PatientPayment | null;
  bids: PatientBid[];
  createdAt: Date;
}
