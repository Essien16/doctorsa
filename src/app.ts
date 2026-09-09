import express, { type Express } from "express";

import { sessionMiddleware } from "./config/session.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { authRouter } from "./modules/auth/auth.module.js";
import { errorHandler } from "./shared/http/error-handler.js";
import { notFoundHandler } from "./shared/http/not-found-handler.js";
import {
  specialtyRouter,
  visitRouter,
  patientPageRouter,
  doctorPageRouter,
} from "./modules/visits/visit.module.js";
import { paymentSelectionRouter, paymentWebhookRouter, mockPaymentRouter} from "./modules/payments/payment.module.js";
import { configureViews } from "./config/views.js";
import { authPageRouter } from "./modules/auth/auth.module.js";
import {
  paymentPageRouter,
} from "./modules/payments/payment.module.js";

export function createApp(): Express {
  const app = express();
  configureViews(app);

  app.disable("x-powered-by");

  app.use(
    "/webhooks/payments",
    express.raw({
      type: "application/json",
      limit: "100kb",
    }),
    paymentWebhookRouter,
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);
  app.use(authPageRouter);
  app.use(patientPageRouter);
  app.use(paymentPageRouter);
  app.use(doctorPageRouter);
  app.use("/auth", authRouter);
  app.use("/specialties", specialtyRouter);
  app.use("/visits", visitRouter);
  app.use("/visits", paymentSelectionRouter);
  app.use("/mock-payments", mockPaymentRouter);

  app.get("/health", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      response.status(200).json({
        status: "ok",
        database: "connected",
      });
    } catch {
      response.status(503).json({
        status: "error",
        database: "unavailable",
      });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}