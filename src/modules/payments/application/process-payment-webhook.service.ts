import { ConflictError } from "../../../shared/errors/conflict-error.js";
import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { PaymentSucceededEvent } from "../domain/payment-event.js";
import type {
  PaymentRepository,
  ProcessPaymentResult,
} from "../domain/payment.repository.js";

export class ProcessPaymentWebhookService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(
    event: PaymentSucceededEvent,
  ): Promise<ProcessPaymentResult> {
    const result =
      await this.paymentRepository.processSuccessfulPayment(
        event,
      );

    if (result.success) {
      return result;
    }

    switch (result.reason) {
      case "PAYMENT_NOT_FOUND":
        throw new NotFoundError("Payment");

      case "PAYMENT_DATA_MISMATCH":
        throw new ConflictError(
          "Payment event does not match the stored payment",
        );

      case "VISIT_NOT_PAYABLE":
        throw new ConflictError(
          "The visit is not in a payable state",
        );
    }
  }
}