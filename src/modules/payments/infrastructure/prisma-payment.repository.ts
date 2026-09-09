import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { PaymentSucceededEvent } from "../domain/payment-event.js";
import type { Payment } from "../domain/payment.js";
import type {
  CreatePaymentResult,
  PaymentRepository,
  ProcessPaymentResult,
  SelectBidAndCreatePaymentData,
} from "../domain/payment.repository.js";

export class PrismaPaymentRepository
  implements PaymentRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async selectBidAndCreatePayment(
  data: SelectBidAndCreatePaymentData,
): Promise<CreatePaymentResult> {
  return this.prisma.$transaction(
    async (
      transaction,
    ): Promise<CreatePaymentResult> => {
      const lockedVisits = await transaction.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT "id"
        FROM "visits"
        WHERE "id" = ${data.visitId}::uuid
        FOR UPDATE
      `;

      if (lockedVisits.length === 0) {
        return {
          success: false,
          reason: "VISIT_NOT_FOUND",
        };
      }

      const visit =
        await transaction.visit.findUnique({
          where: {
            id: data.visitId,
          },
          select: {
            id: true,
            patientId: true,
            preferredAt: true,
            scheduledEndAt: true,
            status: true,
            selectedBidId: true,
            reservedDoctorProfileId: true,
            payment: {
              select: {
                id: true,
              },
            },
          },
        });

      if (
        !visit ||
        visit.patientId !== data.patientId
      ) {
        return {
          success: false,
          reason: "VISIT_NOT_FOUND",
        };
      }

      if (
        visit.status !== "BIDDING" ||
        visit.selectedBidId !== null ||
        visit.reservedDoctorProfileId !== null
      ) {
        return {
          success: false,
          reason: "VISIT_NOT_SELECTABLE",
        };
      }

      if (visit.payment) {
        return {
          success: false,
          reason: "PAYMENT_ALREADY_EXISTS",
        };
      }

      const bid = await transaction.bid.findFirst({
        where: {
          id: data.bidId,
          visitId: visit.id,
        },
        select: {
          id: true,
          amountInKobo: true,
          doctorProfileId: true,
        },
      });

      if (!bid) {
        return {
          success: false,
          reason: "BID_NOT_FOUND",
        };
      }

      /*
       * Serialize selection operations for this doctor.
       * This prevents two patients selecting overlapping
       * visits for the same doctor concurrently.
       */
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${bid.doctorProfileId}::text,
            0
          )
        )
      `;

      const conflictingVisit =
        await transaction.visit.findFirst({
          where: {
            id: {
              not: visit.id,
            },
            reservedDoctorProfileId:
              bid.doctorProfileId,
            preferredAt: {
              lt: visit.scheduledEndAt,
            },
            scheduledEndAt: {
              gt: visit.preferredAt,
            },
          },
          select: {
            id: true,
          },
        });

      if (conflictingVisit) {
        return {
          success: false,
          reason: "DOCTOR_SCHEDULE_CONFLICT",
        };
      }

      await transaction.visit.update({
        where: {
          id: visit.id,
        },
        data: {
          selectedBidId: bid.id,
          reservedDoctorProfileId:
            bid.doctorProfileId,

          /*
           * Reserved for a future payment-expiry feature.
           * It remains null in the current one-attempt
           * mock-payment implementation.
           */
          doctorReservationExpiresAt: null,
        },
      });

      const payment =
        await transaction.payment.create({
          data: {
            visitId: visit.id,
            bidId: bid.id,
            providerReference:
              data.providerReference,
            amountInKobo: bid.amountInKobo,
            status: "PENDING",
          },
        });

      const domainPayment: Payment = {
        id: payment.id,
        visitId: payment.visitId,
        bidId: payment.bidId,
        providerReference:
          payment.providerReference,
        amountInKobo: payment.amountInKobo,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };

      return {
        success: true,
        payment: domainPayment,
      };
    },
  );
}

  async processSuccessfulPayment(
  event: PaymentSucceededEvent,
): Promise<ProcessPaymentResult> {
  return this.prisma.$transaction(
    async (transaction): Promise<ProcessPaymentResult> => {
      const existingEvent =
        await transaction.webhookEvent.findUnique({
          where: {
            providerEventId: event.id,
          },
          select: {
            id: true,
          },
        });

      if (existingEvent) {
        return {
          success: true,
          duplicate: true,
          alreadyProcessed: false,
        };
      }

      const paymentReference =
        await transaction.payment.findUnique({
          where: {
            id: event.data.paymentId,
          },
          select: {
            visitId: true,
          },
        });

      if (!paymentReference) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      const lockedVisits = await transaction.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT "id"
        FROM "visits"
        WHERE "id" = ${paymentReference.visitId}::uuid
        FOR UPDATE
      `;

      if (lockedVisits.length === 0) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      const lockedPayments = await transaction.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT "id"
        FROM "payments"
        WHERE "id" = ${event.data.paymentId}::uuid
        FOR UPDATE
      `;

      if (lockedPayments.length === 0) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      const payment = await transaction.payment.findUnique({
        where: {
          id: event.data.paymentId,
        },
        select: {
          id: true,
          visitId: true,
          bidId: true,
          providerReference: true,
          status: true,
          bid: {
            select: {
              doctorProfileId: true,
            },
          },
        },
      });

      if (!payment) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      if (
        payment.providerReference !==
        event.data.providerReference
      ) {
        return {
          success: false,
          reason: "PAYMENT_DATA_MISMATCH",
        };
      }

      
      const insertedEvents = await transaction.$queryRaw<
        Array<{ id: string }>
      >`
        INSERT INTO "webhook_events" (
          "id",
          "provider_event_id",
          "event_type",
          "payload",
          "processed_at"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${event.id},
          ${event.type},
          ${JSON.stringify(event)}::jsonb,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("provider_event_id")
        DO NOTHING
        RETURNING "id"
      `;

      if (insertedEvents.length === 0) {
        return {
          success: true,
          duplicate: true,
          alreadyProcessed: false,
        };
      }

      if (payment.status === "SUCCEEDED") {
        return {
          success: true,
          duplicate: false,
          alreadyProcessed: true,
        };
      }

      const visit =
        await transaction.visit.findUnique({
            where: {
            id: payment.visitId,
            },
            select: {
            id: true,
            status: true,
            selectedBidId: true,
            reservedDoctorProfileId: true,
            },
      });

      if (
        !visit ||
        visit.status !== "BIDDING" ||
        visit.selectedBidId !== payment.bidId ||
        visit.reservedDoctorProfileId !==
            payment.bid.doctorProfileId ||
        payment.status !== "PENDING"
        ) {
        return {
            success: false,
            reason: "VISIT_NOT_PAYABLE",
        };
      }

      const paidAt = new Date();

      await transaction.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "SUCCEEDED",
          paidAt,
        },
      });

      await transaction.visit.update({
        where: {
          id: visit.id,
        },
        data: {
          status: "PAID",
        },
      });

      await transaction.visitStatusHistory.create({
        data: {
          visitId: visit.id,
          fromStatus: "BIDDING",
          toStatus: "PAID",
        },
      });

      await transaction.visit.update({
        where: {
          id: visit.id,
        },
        data: {
          status: "ASSIGNED",
          assignedDoctorProfileId:
            payment.bid.doctorProfileId,
        },
      });

      await transaction.visitStatusHistory.create({
        data: {
          visitId: visit.id,
          fromStatus: "PAID",
          toStatus: "ASSIGNED",
        },
      });

      return {
        success: true,
        duplicate: false,
        alreadyProcessed: false,
      };
    },
  );
}

async findForPatient(
  paymentId: string,
  patientId: string,
): Promise<Payment | null> {
  const payment = await this.prisma.payment.findFirst({
    where: {
      id: paymentId,
      visit: {
        patientId,
      },
    },
  });

  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    visitId: payment.visitId,
    bidId: payment.bidId,
    providerReference: payment.providerReference,
    amountInKobo: payment.amountInKobo,
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
}