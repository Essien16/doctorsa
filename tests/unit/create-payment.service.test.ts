import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { CreatePaymentService } from "../../src/modules/payments/application/create-payment.service.js";
import type { PaymentReferenceGenerator } from "../../src/modules/payments/domain/payment-reference-generator.js";
import type { PaymentRepository } from "../../src/modules/payments/domain/payment.repository.js";
import type { Payment } from "../../src/modules/payments/domain/payment.js";
import { ConflictError } from "../../src/shared/errors/conflict-error.js";
import { NotFoundError } from "../../src/shared/errors/not-found-error.js";

describe("CreatePaymentService", () => {
  const input = {
    patientId: "00000000-0000-4000-8000-000000000001",
    visitId: "00000000-0000-4000-8000-000000000002",
    bidId: "00000000-0000-4000-8000-000000000003",
  };

  const payment: Payment = {
    id: "00000000-0000-4000-8000-000000000004",
    visitId: input.visitId,
    bidId: input.bidId,
    providerReference: "mock_reference_123",
    amountInKobo: 1_500_000,
    status: "PENDING",
    paidAt: null,
    createdAt: new Date("2026-09-09T10:00:00.000Z"),
    updatedAt: new Date("2026-09-09T10:00:00.000Z"),
  };

  const selectBidAndCreatePayment =
    jest.fn<PaymentRepository["selectBidAndCreatePayment"]>();

  const generate = jest.fn<PaymentReferenceGenerator["generate"]>();

  const paymentRepository = {
    selectBidAndCreatePayment,
  } as unknown as PaymentRepository;

  const referenceGenerator = {
    generate,
  } as PaymentReferenceGenerator;

  const service = new CreatePaymentService(
    paymentRepository,
    referenceGenerator,
  );

  beforeEach(() => {
    selectBidAndCreatePayment.mockReset();
    generate.mockReset();

    generate.mockReturnValue("mock_reference_123");
  });

  it("selects the bid and creates a pending payment", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: true,
      payment,
    });

    const result = await service.execute(input);

    expect(result).toEqual(payment);

    expect(generate).toHaveBeenCalledTimes(1);

    expect(selectBidAndCreatePayment).toHaveBeenCalledWith({
      ...input,
      providerReference: "mock_reference_123",
    });
  });

  it("throws NotFoundError when the visit does not exist", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: false,
      reason: "VISIT_NOT_FOUND",
    });

    await expect(service.execute(input)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when the bid does not exist", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: false,
      reason: "BID_NOT_FOUND",
    });

    await expect(service.execute(input)).rejects.toThrow(NotFoundError);
  });

  it("rejects a visit that is not selectable", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: false,
      reason: "VISIT_NOT_SELECTABLE",
    });

    await expect(service.execute(input)).rejects.toThrow(ConflictError);
  });

  it("rejects a second payment for the same visit", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: false,
      reason: "PAYMENT_ALREADY_EXISTS",
    });

    await expect(service.execute(input)).rejects.toThrow(ConflictError);
  });

  it("rejects a doctor scheduling conflict", async () => {
    selectBidAndCreatePayment.mockResolvedValue({
      success: false,
      reason: "DOCTOR_SCHEDULE_CONFLICT",
    });

    await expect(service.execute(input)).rejects.toThrow(ConflictError);
  });
});
