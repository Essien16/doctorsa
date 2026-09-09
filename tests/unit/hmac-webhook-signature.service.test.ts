import { describe, expect, it } from "@jest/globals";

import { HmacWebhookSignatureService } from "../../src/modules/payments/infrastructure/hmac-webhook-signature.service.js";

describe("HmacWebhookSignatureService", () => {
  const payload = JSON.stringify({
    id: "evt_test_123",
    type: "payment.succeeded",
    data: {
      paymentId: "00000000-0000-4000-8000-000000000001",
      providerReference: "mock_reference_123",
    },
  });

  const service = new HmacWebhookSignatureService("test-webhook-secret");

  it("creates a deterministic SHA-256 hex signature", () => {
    const firstSignature = service.sign(payload);
    const secondSignature = service.sign(payload);

    expect(firstSignature).toBe(secondSignature);
    expect(firstSignature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies a valid signature", () => {
    const signature = service.sign(payload);

    expect(service.verify(payload, signature)).toBe(true);
  });

  it("rejects a signature when the payload changes", () => {
    const signature = service.sign(payload);

    const modifiedPayload = JSON.stringify({
      id: "evt_test_123",
      type: "payment.succeeded",
      data: {
        paymentId: "00000000-0000-4000-8000-000000000001",
        providerReference: "different-provider-reference",
      },
    });

    expect(service.verify(modifiedPayload, signature)).toBe(false);
  });

  it("rejects an altered signature", () => {
    const signature = service.sign(payload);

    const alteredFirstCharacter = signature.startsWith("a") ? "b" : "a";

    const alteredSignature = alteredFirstCharacter + signature.slice(1);

    expect(service.verify(payload, alteredSignature)).toBe(false);
  });

  it("rejects a signature generated with another secret", () => {
    const differentService = new HmacWebhookSignatureService(
      "different-webhook-secret",
    );

    const signature = differentService.sign(payload);

    expect(service.verify(payload, signature)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(service.verify(payload, "")).toBe(false);
  });

  it("rejects a signature with an invalid length", () => {
    expect(service.verify(payload, "abc123")).toBe(false);
  });

  it("rejects a malformed non-hex signature", () => {
    const malformedSignature = "z".repeat(64);

    expect(service.verify(payload, malformedSignature)).toBe(false);
  });

  it("accepts uppercase hexadecimal signatures", () => {
    const signature = service.sign(payload).toUpperCase();

    expect(service.verify(payload, signature)).toBe(true);
  });
});
