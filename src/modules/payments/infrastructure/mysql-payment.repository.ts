import { randomUUID } from "node:crypto";

import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { withTransaction } from "../../../infrastructure/database/transaction.js";
import type { PaymentSucceededEvent } from "../domain/payment-event.js";
import type { Payment, PaymentStatus } from "../domain/payment.js";
import type {
  CreatePaymentResult,
  PaymentRepository,
  ProcessPaymentResult,
  SelectBidAndCreatePaymentData,
} from "../domain/payment.repository.js";

interface IdRow extends RowDataPacket {
  id: string;
}

interface SelectableVisitRow extends RowDataPacket {
  id: string;
  patientId: string;
  preferredAt: Date;
  scheduledEndAt: Date;
  status: string;
  selectedBidId: string | null;
  reservedDoctorProfileId: string | null;
}

interface SelectedBidRow extends RowDataPacket {
  id: string;
  amountInKobo: number;
  doctorProfileId: string;
}

interface PaymentRow extends RowDataPacket {
  id: string;
  visitId: string;
  bidId: string;
  providerReference: string;
  amountInKobo: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentReferenceRow extends RowDataPacket {
  visitId: string;
}

interface LockedPaymentRow extends RowDataPacket {
  id: string;
  visitId: string;
  bidId: string;
  providerReference: string;
  status: string;
  doctorProfileId: string;
}

interface PayableVisitRow extends RowDataPacket {
  id: string;
  status: string;
  selectedBidId: string | null;
  reservedDoctorProfileId: string | null;
}

function parsePaymentStatus(status: string): PaymentStatus {
  if (status === "PENDING" || status === "SUCCEEDED" || status === "FAILED") {
    return status;
  }

  throw new Error(`Unsupported payment status returned by MySQL: ${status}`);
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    visitId: row.visitId,
    bidId: row.bidId,
    providerReference: row.providerReference,
    amountInKobo: row.amountInKobo,
    status: parsePaymentStatus(row.status),
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function insertWebhookEvent(
  connection: PoolConnection,
  event: PaymentSucceededEvent,
): Promise<boolean> {
  /*
   * The unique provider_event_id index is the final
   * idempotency guarantee. INSERT IGNORE safely handles
   * concurrent delivery of the same provider event.
   */
  const [result] = await connection.execute<ResultSetHeader>(
    `
        INSERT IGNORE INTO webhook_events (
          id,
          provider_event_id,
          event_type,
          payload,
          processed_at
        )
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
      `,
    [randomUUID(), event.id, event.type, JSON.stringify(event)],
  );

  return result.affectedRows === 1;
}

export class MySqlPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: Pool) {}

  async selectBidAndCreatePayment(
    data: SelectBidAndCreatePaymentData,
  ): Promise<CreatePaymentResult> {
    return withTransaction(this.pool, async (connection) => {
      /*
       * Read the visit and bid first so we can identify the doctor.
       * These are preliminary reads; their values are validated
       * again after the required locks have been acquired.
       */
      const [candidateVisits] = await connection.execute<SelectableVisitRow[]>(
        `
          SELECT
            id,
            patient_id AS patientId,
            preferred_at AS preferredAt,
            scheduled_end_at AS scheduledEndAt,
            status,
            selected_bid_id AS selectedBidId,
            reserved_doctor_profile_id
              AS reservedDoctorProfileId
          FROM visits
          WHERE id = ?
          LIMIT 1
        `,
        [data.visitId],
      );

      const candidateVisit = candidateVisits[0];

      if (!candidateVisit || candidateVisit.patientId !== data.patientId) {
        return {
          success: false,
          reason: "VISIT_NOT_FOUND",
        };
      }

      const [candidateBids] = await connection.execute<SelectedBidRow[]>(
        `
          SELECT
            id,
            amount_in_kobo AS amountInKobo,
            doctor_profile_id AS doctorProfileId
          FROM bids
          WHERE id = ?
            AND visit_id = ?
          LIMIT 1
        `,
        [data.bidId, data.visitId],
      );

      const bid = candidateBids[0];

      if (!bid) {
        return {
          success: false,
          reason: "BID_NOT_FOUND",
        };
      }

      const [lockedDoctorProfiles] = await connection.execute<IdRow[]>(
        `
          SELECT id
          FROM doctor_profiles
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [bid.doctorProfileId],
      );

      if (lockedDoctorProfiles.length === 0) {
        throw new Error(`Doctor profile ${bid.doctorProfileId} was not found`);
      }

      
      const [lockedVisits] = await connection.execute<SelectableVisitRow[]>(
        `
          SELECT
            id,
            patient_id AS patientId,
            preferred_at AS preferredAt,
            scheduled_end_at AS scheduledEndAt,
            status,
            selected_bid_id AS selectedBidId,
            reserved_doctor_profile_id
              AS reservedDoctorProfileId
          FROM visits
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [data.visitId],
      );

      const visit = lockedVisits[0];

      if (!visit || visit.patientId !== data.patientId) {
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

      const [existingPayments] = await connection.execute<IdRow[]>(
        `
          SELECT id
          FROM payments
          WHERE visit_id = ?
          LIMIT 1
        `,
        [visit.id],
      );

      if (existingPayments.length > 0) {
        return {
          success: false,
          reason: "PAYMENT_ALREADY_EXISTS",
        };
      }

      const [conflictingVisits] = await connection.execute<IdRow[]>(
        `
          SELECT id
          FROM visits
          WHERE id <> ?
            AND preferred_at < ?
            AND scheduled_end_at > ?
            AND (
              reserved_doctor_profile_id = ?
              OR assigned_doctor_profile_id = ?
            )
          LIMIT 1
        `,
        [
          visit.id,
          visit.scheduledEndAt,
          visit.preferredAt,
          bid.doctorProfileId,
          bid.doctorProfileId,
        ],
      );

      if (conflictingVisits.length > 0) {
        return {
          success: false,
          reason: "DOCTOR_SCHEDULE_CONFLICT",
        };
      }

      await connection.execute(
        `
        UPDATE visits
        SET
          selected_bid_id = ?,
          reserved_doctor_profile_id = ?,
          doctor_reservation_expires_at = NULL
        WHERE id = ?
      `,
        [bid.id, bid.doctorProfileId, visit.id],
      );

      const paymentId = randomUUID();

      await connection.execute(
        `
        INSERT INTO payments (
          id,
          visit_id,
          bid_id,
          provider_reference,
          amount_in_kobo,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `,
        [paymentId, visit.id, bid.id, data.providerReference, bid.amountInKobo],
      );

      const [payments] = await connection.execute<PaymentRow[]>(
        `
          SELECT
            id,
            visit_id AS visitId,
            bid_id AS bidId,
            provider_reference AS providerReference,
            amount_in_kobo AS amountInKobo,
            status,
            paid_at AS paidAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM payments
          WHERE id = ?
          LIMIT 1
        `,
        [paymentId],
      );

      const payment = payments[0];

      if (!payment) {
        throw new Error("Created payment could not be retrieved");
      }

      return {
        success: true,
        payment: mapPayment(payment),
      };
    });
  }

  async processSuccessfulPayment(
    event: PaymentSucceededEvent,
  ): Promise<ProcessPaymentResult> {
    return withTransaction(this.pool, async (connection) => {
      
      const [existingEvents] = await connection.execute<IdRow[]>(
        `
              SELECT id
              FROM webhook_events
              WHERE provider_event_id = ?
              LIMIT 1
            `,
        [event.id],
      );

      if (existingEvents.length > 0) {
        return {
          success: true,
          duplicate: true,
          alreadyProcessed: false,
        };
      }

      const [paymentReferences] = await connection.execute<
        PaymentReferenceRow[]
      >(
        `
              SELECT visit_id AS visitId
              FROM payments
              WHERE id = ?
              LIMIT 1
            `,
        [event.data.paymentId],
      );

      const paymentReference = paymentReferences[0];

      if (!paymentReference) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      const [visits] = await connection.execute<PayableVisitRow[]>(
        `
              SELECT
                id,
                status,
                selected_bid_id AS selectedBidId,
                reserved_doctor_profile_id
                  AS reservedDoctorProfileId
              FROM visits
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
        [paymentReference.visitId],
      );

      const visit = visits[0];

      if (!visit) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      const [payments] = await connection.execute<LockedPaymentRow[]>(
        `
              SELECT
                payment.id,
                payment.visit_id AS visitId,
                payment.bid_id AS bidId,
                payment.provider_reference
                  AS providerReference,
                payment.status,
                bid.doctor_profile_id
                  AS doctorProfileId
              FROM payments AS payment
              INNER JOIN bids AS bid
                ON bid.id = payment.bid_id
              WHERE payment.id = ?
              LIMIT 1
              FOR UPDATE
            `,
        [event.data.paymentId],
      );

      const payment = payments[0];

      if (!payment) {
        return {
          success: false,
          reason: "PAYMENT_NOT_FOUND",
        };
      }

      if (payment.providerReference !== event.data.providerReference) {
        return {
          success: false,
          reason: "PAYMENT_DATA_MISMATCH",
        };
      }

      if (payment.status === "SUCCEEDED") {
        const inserted = await insertWebhookEvent(connection, event);

        if (!inserted) {
          return {
            success: true,
            duplicate: true,
            alreadyProcessed: false,
          };
        }

        return {
          success: true,
          duplicate: false,
          alreadyProcessed: true,
        };
      }

      if (
        payment.status !== "PENDING" ||
        visit.status !== "BIDDING" ||
        visit.selectedBidId !== payment.bidId ||
        visit.reservedDoctorProfileId !== payment.doctorProfileId
      ) {
        return {
          success: false,
          reason: "VISIT_NOT_PAYABLE",
        };
      }

      const inserted = await insertWebhookEvent(connection, event);

      if (!inserted) {
        return {
          success: true,
          duplicate: true,
          alreadyProcessed: false,
        };
      }

      const paidAt = new Date();

      await connection.execute(
        `
            UPDATE payments
            SET
              status = 'SUCCEEDED',
              paid_at = ?
            WHERE id = ?
          `,
        [paidAt, payment.id],
      );

      await connection.execute(
        `
            UPDATE visits
            SET status = 'PAID'
            WHERE id = ?
          `,
        [visit.id],
      );

      await connection.execute(
        `
            INSERT INTO visit_status_history (
              id,
              visit_id,
              from_status,
              to_status
            )
            VALUES (?, ?, 'BIDDING', 'PAID')
          `,
        [randomUUID(), visit.id],
      );

      await connection.execute(
        `
            UPDATE visits
            SET
              status = 'ASSIGNED',
              assigned_doctor_profile_id = ?,
              reserved_doctor_profile_id = NULL,
              doctor_reservation_expires_at = NULL
            WHERE id = ?
          `,
        [payment.doctorProfileId, visit.id],
      );

      await connection.execute(
        `
            INSERT INTO visit_status_history (
              id,
              visit_id,
              from_status,
              to_status
            )
            VALUES (?, ?, 'PAID', 'ASSIGNED')
          `,
        [randomUUID(), visit.id],
      );

      return {
        success: true,
        duplicate: false,
        alreadyProcessed: false,
      };
    });
  }

  async findForPatient(
    paymentId: string,
    patientId: string,
  ): Promise<Payment | null> {
    const [rows] = await this.pool.execute<PaymentRow[]>(
      `
          SELECT
            payment.id,
            payment.visit_id AS visitId,
            payment.bid_id AS bidId,
            payment.provider_reference
              AS providerReference,
            payment.amount_in_kobo
              AS amountInKobo,
            payment.status,
            payment.paid_at AS paidAt,
            payment.created_at AS createdAt,
            payment.updated_at AS updatedAt
          FROM payments AS payment
          INNER JOIN visits AS visit
            ON visit.id = payment.visit_id
          WHERE payment.id = ?
            AND visit.patient_id = ?
          LIMIT 1
        `,
      [paymentId, patientId],
    );

    const payment = rows[0];

    return payment ? mapPayment(payment) : null;
  }
}
