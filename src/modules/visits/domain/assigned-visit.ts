export interface AssignedVisit {
  id: string;
  patientName: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  amountInKobo: number;
  bidNote: string;
  assignedAt: Date;
}
