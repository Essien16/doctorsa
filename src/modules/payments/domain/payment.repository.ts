import type { Payment } from "./payment.js";
import type { PaymentSucceededEvent } from "./payment-event.js";


export interface SelectBidAndCreatePaymentData {
  patientId: string;
  visitId: string;
  bidId: string;
  providerReference: string;
}

export type CreatePaymentFailureReason =
  | "VISIT_NOT_FOUND"
  | "BID_NOT_FOUND"
  | "VISIT_NOT_SELECTABLE"
  | "PAYMENT_ALREADY_EXISTS";

export type CreatePaymentResult =
  | {
      success: true;
      payment: Payment;
    }
  | {
      success: false;
      reason: CreatePaymentFailureReason;
    };

export interface PaymentRepository {
  selectBidAndCreatePayment(
    data: SelectBidAndCreatePaymentData,
  ): Promise<CreatePaymentResult>;

  processSuccessfulPayment(
  event: PaymentSucceededEvent,
): Promise<ProcessPaymentResult>;

findForPatient(
  paymentId: string,
  patientId: string,
): Promise<Payment | null>;
}

export type ProcessPaymentFailureReason =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_DATA_MISMATCH"
  | "VISIT_NOT_PAYABLE";

export type ProcessPaymentResult =
  | {
      success: true;
      duplicate: boolean;
      alreadyProcessed: boolean;
    }
  | {
      success: false;
      reason: ProcessPaymentFailureReason;
    };