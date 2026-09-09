import { ConflictError } from "../../../shared/errors/conflict-error.js";
import { NotFoundError } from "../../../shared/errors/not-found-error.js";
import type { Payment } from "../domain/payment.js";
import type { PaymentReferenceGenerator } from "../domain/payment-reference-generator.js";
import type { PaymentRepository } from "../domain/payment.repository.js";

export interface CreatePaymentInput {
  patientId: string;
  visitId: string;
  bidId: string;
}

export class CreatePaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly referenceGenerator: PaymentReferenceGenerator,
  ) {}

  async execute(input: CreatePaymentInput): Promise<Payment> {
    const providerReference = this.referenceGenerator.generate();

    const result = await this.paymentRepository.selectBidAndCreatePayment({
      patientId: input.patientId,
      visitId: input.visitId,
      bidId: input.bidId,
      providerReference,
    });

    if (result.success) {
      return result.payment;
    }

    switch (result.reason) {
      case "VISIT_NOT_FOUND":
        throw new NotFoundError("Visit");

      case "BID_NOT_FOUND":
        throw new NotFoundError("Bid");

      case "VISIT_NOT_SELECTABLE":
        throw new ConflictError(
          "This visit is not available for bid selection",
        );

      case "PAYMENT_ALREADY_EXISTS":
        throw new ConflictError("A payment already exists for this visit");

      case "DOCTOR_SCHEDULE_CONFLICT":
        throw new ConflictError(
          "This doctor already has a visit scheduled during this time",
        );
    }
  }
}
