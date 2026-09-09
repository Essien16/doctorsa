export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED";

export interface Payment {
  id: string;
  visitId: string;
  bidId: string;
  providerReference: string;
  amountInKobo: number;
  status: PaymentStatus;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}