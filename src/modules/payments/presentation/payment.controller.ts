import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { CreatePaymentService } from "../application/create-payment.service.js";
import { selectBidParamsSchema } from "./payment.schemas.js";

export class PaymentController {
  constructor(
    private readonly createPaymentService:
      CreatePaymentService,
  ) {}

  selectBid = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.session.userId) {
        throw new AuthenticationError();
      }

      const validation = selectBidParamsSchema.safeParse(
        request.params,
      );

      if (!validation.success) {
        response.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "The visit or bid ID is invalid",
            details: validation.error.flatten().fieldErrors,
          },
        });

        return;
      }

      const payment = await this.createPaymentService.execute({
        patientId: request.session.userId,
        visitId: validation.data.visitId,
        bidId: validation.data.bidId,
      });

      response.status(201).json({
        payment,
        checkoutUrl: `/mock-payments/${payment.id}`,
      });
    } catch (error) {
      next(error);
    }
  };
}