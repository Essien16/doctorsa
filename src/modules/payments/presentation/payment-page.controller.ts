import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { CreatePaymentService } from "../application/create-payment.service.js";
import type { GetPaymentCheckoutService } from "../application/get-payment-checkout.service.js";

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
});

export class PaymentPageController {
  constructor(
    private readonly createPaymentService:
      CreatePaymentService,
    private readonly getPaymentCheckoutService:
      GetPaymentCheckoutService,
  ) {}

  selectBid = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const patientId = this.getPatientId(request);
      const visitId = request.params["visitId"];
      const bidId = request.params["bidId"];

      if (
        typeof visitId !== "string" ||
        typeof bidId !== "string"
      ) {
        response.status(404).send(
          "Visit or bid not found",
        );

        return;
      }

      const payment =
        await this.createPaymentService.execute({
          patientId,
          visitId,
          bidId,
        });

      response.redirect(
        303,
        `/mock-payments/${payment.id}`,
      );
    } catch (error) {
      next(error);
    }
  };

  showCheckout = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const patientId = this.getPatientId(request);
      const paymentId = request.params["paymentId"];

      if (typeof paymentId !== "string") {
        response.status(404).send("Payment not found");
        return;
      }

      const payment =
        await this.getPaymentCheckoutService.execute({
          paymentId,
          patientId,
        });

      response.status(200).render(
        "patient/mock-checkout",
        {
          title: "Complete payment",
          payment: {
            id: payment.id,
            visitId: payment.visitId,
            reference: payment.providerReference,
            amount: currencyFormatter.format(
              payment.amountInKobo / 100,
            ),
            status: payment.status,
          },
          isPending: payment.status === "PENDING",
          isSucceeded:
            payment.status === "SUCCEEDED",
          isFailed: payment.status === "FAILED",
        },
      );
    } catch (error) {
      next(error);
    }
  };

  private getPatientId(request: Request): string {
    const patientId = request.session.userId;

    if (!patientId) {
      throw new AuthenticationError(
        "Authentication required",
      );
    }

    return patientId;
  }
}