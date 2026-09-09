import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookSignatureService } from "../domain/webhook-signature.service.js";

export class HmacWebhookSignatureService implements WebhookSignatureService {
  constructor(private readonly secret: string) {}

  sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  verify(payload: string, signature: string): boolean {
    const expectedSignature = this.sign(payload);

    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    const receivedBuffer = Buffer.from(signature, "hex");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}
