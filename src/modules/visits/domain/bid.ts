export interface Bid {
  id: string;
  visitId: string;
  doctorProfileId: string;
  amountInKobo: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}