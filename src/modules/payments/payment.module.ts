import { prisma } from "../../infrastructure/database/prisma.js";
import { CreatePaymentService } from "./application/create-payment.service.js";
import { MockPaymentReferenceGenerator } from "./infrastructure/mock-payment-reference-generator.js";
import { PrismaPaymentRepository } from "./infrastructure/prisma-payment.repository.js";
import { PaymentController } from "./presentation/payment.controller.js";
import { createPaymentSelectionRouter } from "./presentation/payment.routes.js";
import { env } from "../../config/env.js";
import { ProcessPaymentWebhookService } from "./application/process-payment-webhook.service.js";
import { HmacWebhookSignatureService } from "./infrastructure/hmac-webhook-signature.service.js";
import { WebhookController } from "./presentation/webhook.controller.js";
import { createPaymentWebhookRouter } from "./presentation/webhook.routes.js";
import { ConfirmMockPaymentService } from "./application/confirm-mock-payment.service.js";
import { MockPaymentController } from "./presentation/mock-payment.controller.js";
import { createMockPaymentRouter } from "./presentation/mock-payment.routes.js";
import { PaymentPageController } from "./presentation/payment-page.controller.js";
import { createPaymentPageRouter } from "./presentation/payment-page.routes.js";
import { GetPaymentCheckoutService } from "./application/get-payment-checkout.service.js";

const paymentRepository = new PrismaPaymentRepository(prisma);

const referenceGenerator = new MockPaymentReferenceGenerator();

const createPaymentService = new CreatePaymentService(
  paymentRepository,
  referenceGenerator,
);

const paymentController = new PaymentController(createPaymentService);

const signatureService = new HmacWebhookSignatureService(env.WEBHOOK_SECRET);

const processPaymentWebhookService = new ProcessPaymentWebhookService(
  paymentRepository,
);

const webhookController = new WebhookController(
  processPaymentWebhookService,
  signatureService,
);

const confirmMockPaymentService = new ConfirmMockPaymentService(
  paymentRepository,
);

const mockPaymentController = new MockPaymentController(
  confirmMockPaymentService,
  signatureService,
  env.APP_BASE_URL,
);

const getPaymentCheckoutService = new GetPaymentCheckoutService(
  paymentRepository,
);

const paymentPageController = new PaymentPageController(
  createPaymentService,
  getPaymentCheckoutService,
);

export const paymentSelectionRouter =
  createPaymentSelectionRouter(paymentController);

export const paymentWebhookRouter =
  createPaymentWebhookRouter(webhookController);

export const mockPaymentRouter = createMockPaymentRouter(mockPaymentController);

export const paymentPageRouter = createPaymentPageRouter(paymentPageController);
