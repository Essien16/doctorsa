import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../../shared/errors/app-error.js";
import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { ConfirmMockPaymentService } from "../application/confirm-mock-payment.service.js";
import type { WebhookSignatureService } from "../domain/webhook-signature.service.js";
import { paymentIdParamsSchema } from "./payment.schemas.js";

export class MockPaymentController {
  constructor(
    private readonly confirmMockPaymentService: ConfirmMockPaymentService,
    private readonly signatureService: WebhookSignatureService,
    private readonly applicationBaseUrl: string,
  ) {}

  confirm = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const patientId = request.session.userId;

      if (!patientId) {
        throw new AuthenticationError();
      }

      const validation = paymentIdParamsSchema.safeParse(request.params);

      if (!validation.success) {
        response.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "The payment ID is invalid",
            details: validation.error.flatten().fieldErrors,
          },
        });

        return;
      }

      const confirmation = await this.confirmMockPaymentService.execute({
        paymentId: validation.data.paymentId,
        patientId,
      });

      const rawBody = JSON.stringify(confirmation.event);

      const signature = this.signatureService.sign(rawBody);

      const webhookResponse = await fetch(
        `${this.applicationBaseUrl}/webhooks/payments`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-signature": signature,
          },
          body: rawBody,
        },
      );

      const webhookResult: unknown = await webhookResponse.json();

      if (!webhookResponse.ok) {
        throw new AppError(
          "Mock webhook delivery failed",
          502,
          "WEBHOOK_DELIVERY_FAILED",
        );
      }

      if (request.body?.responseMode === "html") {
        response.redirect(303, `/patient/visits/${confirmation.visitId}`);

        return;
      }

      response.status(200).json({
        paymentId: validation.data.paymentId,
        eventId: confirmation.event.id,
        webhook: webhookResult,
      });
    } catch (error) {
      next(error);
    }
  };
}
