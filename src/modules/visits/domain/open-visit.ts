export interface OpenVisit {
  id: string;
  patientName: string;
  specialtyId: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: "OPEN" | "BIDDING";
  createdAt: Date;
}