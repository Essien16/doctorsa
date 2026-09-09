import { randomUUID } from "node:crypto";

import { ConflictError } from "../../../shared/errors/conflict-error.js";
import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { PaymentSucceededEvent } from "../domain/payment-event.js";
import type { PaymentRepository } from "../domain/payment.repository.js";

export interface ConfirmMockPaymentInput {
  paymentId: string;
  patientId: string;
}

export interface ConfirmMockPaymentResult {
  visitId: string;
  event: PaymentSucceededEvent;
}

export class ConfirmMockPaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(
    input: ConfirmMockPaymentInput,
  ): Promise<ConfirmMockPaymentResult> {
    const payment =
      await this.paymentRepository.findForPatient(
        input.paymentId,
        input.patientId,
      );

    if (!payment) {
      throw new NotFoundError("Payment");
    }

    if (payment.status !== "PENDING") {
      throw new ConflictError(
        "Only pending payments can be confirmed",
      );
    }

    return {
      visitId: payment.visitId,
      event: {
        id: `evt_${randomUUID()}`,
        type: "payment.succeeded",
        data: {
          paymentId: payment.id,
          providerReference:
            payment.providerReference,
        },
      },
    };
  }
}