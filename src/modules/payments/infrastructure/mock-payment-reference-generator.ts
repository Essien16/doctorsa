import { randomUUID } from "node:crypto";

import type { PaymentReferenceGenerator } from "../domain/payment-reference-generator.js";

export class MockPaymentReferenceGenerator
  implements PaymentReferenceGenerator
{
  generate(): string {
    return `mock_${randomUUID()}`;
  }
}