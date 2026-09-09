import type { NextFunction, Request, Response } from "express";

import type { ProcessPaymentWebhookService } from "../application/process-payment-webhook.service.js";
import type { WebhookSignatureService } from "../domain/webhook-signature.service.js";
import { paymentSucceededEventSchema } from "./payment.schemas.js";

export class WebhookController {
  constructor(
    private readonly processPaymentWebhookService: ProcessPaymentWebhookService,
    private readonly signatureService: WebhookSignatureService,
  ) {}

  handle = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!Buffer.isBuffer(request.body)) {
        response.status(400).json({
          error: {
            code: "INVALID_WEBHOOK_BODY",
            message: "Webhook body must be raw JSON",
          },
        });

        return;
      }

      const rawBody = request.body.toString("utf8");

      const signature = request.header("x-webhook-signature");

      if (!signature || !this.signatureService.verify(rawBody, signature)) {
        response.status(401).json({
          error: {
            code: "INVALID_WEBHOOK_SIGNATURE",
            message: "Webhook signature is invalid",
          },
        });

        return;
      }

      let parsedBody: unknown;

      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        response.status(400).json({
          error: {
            code: "INVALID_WEBHOOK_JSON",
            message: "Webhook body must contain valid JSON",
          },
        });

        return;
      }

      const validation = paymentSucceededEventSchema.safeParse(parsedBody);

      if (!validation.success) {
        response.status(400).json({
          error: {
            code: "INVALID_WEBHOOK_EVENT",
            message: "Webhook event is invalid",
            details: validation.error.flatten().fieldErrors,
          },
        });

        return;
      }

      const result = await this.processPaymentWebhookService.execute(
        validation.data,
      );

      response.status(200).json({
        received: true,
        duplicate: result.success ? result.duplicate : false,
        alreadyProcessed: result.success ? result.alreadyProcessed : false,
      });
    } catch (error) {
      next(error);
    }
  };
}
