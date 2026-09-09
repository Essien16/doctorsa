import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ProcessPaymentWebhookService } from "../../src/modules/payments/application/process-payment-webhook.service.js";
import type { PaymentSucceededEvent } from "../../src/modules/payments/domain/payment-event.js";
import type { PaymentRepository } from "../../src/modules/payments/domain/payment.repository.js";
import { ConflictError } from "../../src/shared/errors/conflict-error.js";
import { NotFoundError } from "../../src/shared/errors/not-found-error.js";

describe("ProcessPaymentWebhookService", () => {
  const event: PaymentSucceededEvent = {
    id: "evt_test_123",
    type: "payment.succeeded",
    data: {
      paymentId: "00000000-0000-4000-8000-000000000001",
      providerReference: "mock_reference_123",
    },
  };

  const processSuccessfulPayment =
    jest.fn<PaymentRepository["processSuccessfulPayment"]>();

  const paymentRepository = {
    processSuccessfulPayment,
  } as unknown as PaymentRepository;

  const service = new ProcessPaymentWebhookService(paymentRepository);

  beforeEach(() => {
    processSuccessfulPayment.mockReset();
  });

  it("returns a successful processing result", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: true,
      duplicate: false,
      alreadyProcessed: false,
    });

    const result = await service.execute(event);

    expect(result).toEqual({
      success: true,
      duplicate: false,
      alreadyProcessed: false,
    });

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);

    expect(processSuccessfulPayment).toHaveBeenCalledWith(event);
  });

  it("treats a duplicate webhook as successful", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: true,
      duplicate: true,
      alreadyProcessed: false,
    });

    const result = await service.execute(event);

    expect(result).toEqual({
      success: true,
      duplicate: true,
      alreadyProcessed: false,
    });

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it("handles an already processed payment safely", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: true,
      duplicate: false,
      alreadyProcessed: true,
    });

    const result = await service.execute(event);

    expect(result).toEqual({
      success: true,
      duplicate: false,
      alreadyProcessed: true,
    });

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it("throws NotFoundError when the payment does not exist", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: false,
      reason: "PAYMENT_NOT_FOUND",
    });

    await expect(service.execute(event)).rejects.toThrow(NotFoundError);

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it("throws ConflictError when webhook data does not match the payment", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: false,
      reason: "PAYMENT_DATA_MISMATCH",
    });

    await expect(service.execute(event)).rejects.toThrow(ConflictError);

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it("throws ConflictError when the visit is not payable", async () => {
    processSuccessfulPayment.mockResolvedValue({
      success: false,
      reason: "VISIT_NOT_PAYABLE",
    });

    await expect(service.execute(event)).rejects.toThrow(ConflictError);

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });
});
