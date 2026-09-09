import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { Payment } from "../domain/payment.js";
import type { PaymentRepository } from "../domain/payment.repository.js";

export interface GetPaymentCheckoutInput {
  paymentId: string;
  patientId: string;
}

export class GetPaymentCheckoutService {
  constructor(
    private readonly paymentRepository:
      PaymentRepository,
  ) {}

  async execute(
    input: GetPaymentCheckoutInput,
  ): Promise<Payment> {
    const payment =
      await this.paymentRepository.findForPatient(
        input.paymentId,
        input.patientId,
      );

    if (!payment) {
      throw new NotFoundError("Payment");
    }

    return payment;
  }
}