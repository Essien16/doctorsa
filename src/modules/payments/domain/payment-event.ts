export interface PaymentSucceededEvent {
  id: string;
  type: "payment.succeeded";
  data: {
    paymentId: string;
    providerReference: string;
  };
}
