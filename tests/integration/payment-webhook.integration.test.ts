import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { RowDataPacket } from "mysql2/promise";

import {
  closeMySqlConnection,
  mysqlPool,
} from "../../src/infrastructure/database/mysql.js";
import { withTransaction } from "../../src/infrastructure/database/transaction.js";
import { MySqlPaymentRepository } from "../../src/modules/payments/infrastructure/mysql-payment.repository.js";

const databaseUrl = process.env.MYSQL_DATABASE_URL;

if (!databaseUrl?.includes("doctorsa_test")) {
  throw new Error(
    "Integration tests must use the doctorsa_test MySQL database",
  );
}

interface PaymentRow extends RowDataPacket {
  status: string;
  paidAt: Date | null;
}

interface VisitRow extends RowDataPacket {
  status: string;
  assignedDoctorProfileId: string | null;
  reservedDoctorProfileId: string | null;
}

interface CountRow extends RowDataPacket {
  count: number | string;
}

const paymentRepository = new MySqlPaymentRepository(mysqlPool);

describe("MySqlPaymentRepository webhook processing", () => {
  const ids = {
    specialtyId: randomUUID(),
    patientId: randomUUID(),
    doctorUserId: randomUUID(),
    doctorProfileId: randomUUID(),
    visitId: randomUUID(),
    bidId: randomUUID(),
    paymentId: randomUUID(),
  };

  const providerReference = `mock_${randomUUID()}`;

  const event = {
    id: `evt_${randomUUID()}`,
    type: "payment.succeeded" as const,
    data: {
      paymentId: ids.paymentId,
      providerReference,
    },
  };

  async function cleanUp(): Promise<void> {
    await mysqlPool.execute(
      `
        DELETE FROM webhook_events
        WHERE provider_event_id = ?
      `,
      [event.id],
    );

    await mysqlPool.execute(
      `
        DELETE FROM payments
        WHERE id = ?
      `,
      [ids.paymentId],
    );

    /*
     * Remove references to the bid and doctor before
     * deleting fixture records.
     */
    await mysqlPool.execute(
      `
        UPDATE visits
        SET
          selected_bid_id = NULL,
          reserved_doctor_profile_id = NULL,
          assigned_doctor_profile_id = NULL
        WHERE id = ?
      `,
      [ids.visitId],
    );

    await mysqlPool.execute(
      `
        DELETE FROM bids
        WHERE id = ?
      `,
      [ids.bidId],
    );

    await mysqlPool.execute(
      `
        DELETE FROM visits
        WHERE id = ?
      `,
      [ids.visitId],
    );

    await mysqlPool.execute(
      `
        DELETE FROM doctor_profiles
        WHERE id = ?
      `,
      [ids.doctorProfileId],
    );

    await mysqlPool.execute(
      `
        DELETE FROM users
        WHERE id IN (?, ?)
      `,
      [ids.patientId, ids.doctorUserId],
    );

    await mysqlPool.execute(
      `
        DELETE FROM specialties
        WHERE id = ?
      `,
      [ids.specialtyId],
    );
  }

  beforeEach(async () => {
    await cleanUp();

    const preferredAt = new Date("2030-09-15T11:00:00.000Z");

    const scheduledEndAt = new Date("2030-09-15T12:00:00.000Z");

    await withTransaction(mysqlPool, async (connection) => {
      await connection.execute(
        `
            INSERT INTO specialties (
              id,
              name
            )
            VALUES (?, ?)
          `,
        [ids.specialtyId, `Integration Specialty ${ids.specialtyId}`],
      );

      await connection.execute(
        `
            INSERT INTO users (
              id,
              name,
              email,
              password_hash,
              role
            )
            VALUES (?, ?, ?, ?, 'PATIENT')
          `,
        [
          ids.patientId,
          "Integration Patient",
          `patient-${ids.patientId}@example.com`,
          "unused-test-hash",
        ],
      );

      await connection.execute(
        `
            INSERT INTO users (
              id,
              name,
              email,
              password_hash,
              role
            )
            VALUES (?, ?, ?, ?, 'DOCTOR')
          `,
        [
          ids.doctorUserId,
          "Integration Doctor",
          `doctor-${ids.doctorUserId}@example.com`,
          "unused-test-hash",
        ],
      );

      await connection.execute(
        `
            INSERT INTO doctor_profiles (
              id,
              user_id,
              specialty_id
            )
            VALUES (?, ?, ?)
          `,
        [ids.doctorProfileId, ids.doctorUserId, ids.specialtyId],
      );

      await connection.execute(
        `
            INSERT INTO visits (
              id,
              patient_id,
              specialty_id,
              location,
              preferred_at,
              scheduled_end_at,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'BIDDING')
          `,
        [
          ids.visitId,
          ids.patientId,
          ids.specialtyId,
          "Integration Test Location",
          preferredAt,
          scheduledEndAt,
        ],
      );

      await connection.execute(
        `
            INSERT INTO bids (
              id,
              visit_id,
              doctor_profile_id,
              amount_in_kobo,
              note
            )
            VALUES (?, ?, ?, ?, ?)
          `,
        [
          ids.bidId,
          ids.visitId,
          ids.doctorProfileId,
          1_500_000,
          "Integration test bid",
        ],
      );

      await connection.execute(
        `
            UPDATE visits
            SET
              selected_bid_id = ?,
              reserved_doctor_profile_id = ?
            WHERE id = ?
          `,
        [ids.bidId, ids.doctorProfileId, ids.visitId],
      );

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
        [ids.paymentId, ids.visitId, ids.bidId, providerReference, 1_500_000],
      );

      await connection.execute(
        `
            INSERT INTO visit_status_history (
              id,
              visit_id,
              from_status,
              to_status
            )
            VALUES
              (?, ?, NULL, 'OPEN'),
              (?, ?, 'OPEN', 'BIDDING')
          `,
        [randomUUID(), ids.visitId, randomUUID(), ids.visitId],
      );
    });
  });

  afterAll(async () => {
    try {
      await cleanUp();
    } finally {
      await closeMySqlConnection();
    }
  });

  it("processes a successful payment exactly once", async () => {
    const firstResult = await paymentRepository.processSuccessfulPayment(event);

    const secondResult =
      await paymentRepository.processSuccessfulPayment(event);

    expect(firstResult).toEqual({
      success: true,
      duplicate: false,
      alreadyProcessed: false,
    });

    expect(secondResult).toEqual({
      success: true,
      duplicate: true,
      alreadyProcessed: false,
    });

    const [paymentRows] = await mysqlPool.execute<PaymentRow[]>(
      `
            SELECT
              status,
              paid_at AS paidAt
            FROM payments
            WHERE id = ?
            LIMIT 1
          `,
      [ids.paymentId],
    );

    expect(paymentRows[0]?.status).toBe("SUCCEEDED");

    expect(paymentRows[0]?.paidAt).toBeInstanceOf(Date);

    const [visitRows] = await mysqlPool.execute<VisitRow[]>(
      `
            SELECT
              status,
              assigned_doctor_profile_id
                AS assignedDoctorProfileId,
              reserved_doctor_profile_id
                AS reservedDoctorProfileId
            FROM visits
            WHERE id = ?
            LIMIT 1
          `,
      [ids.visitId],
    );

    expect(visitRows[0]).toMatchObject({
      status: "ASSIGNED",
      assignedDoctorProfileId: ids.doctorProfileId,
      reservedDoctorProfileId: null,
    });

    const [webhookCountRows] = await mysqlPool.execute<CountRow[]>(
      `
            SELECT COUNT(*) AS count
            FROM webhook_events
            WHERE provider_event_id = ?
          `,
      [event.id],
    );

    expect(Number(webhookCountRows[0]?.count)).toBe(1);

    const [paidTransitionRows] = await mysqlPool.execute<CountRow[]>(
      `
            SELECT COUNT(*) AS count
            FROM visit_status_history
            WHERE visit_id = ?
              AND from_status = 'BIDDING'
              AND to_status = 'PAID'
          `,
      [ids.visitId],
    );

    const [assignedTransitionRows] = await mysqlPool.execute<CountRow[]>(
      `
            SELECT COUNT(*) AS count
            FROM visit_status_history
            WHERE visit_id = ?
              AND from_status = 'PAID'
              AND to_status = 'ASSIGNED'
          `,
      [ids.visitId],
    );

    expect(Number(paidTransitionRows[0]?.count)).toBe(1);

    expect(Number(assignedTransitionRows[0]?.count)).toBe(1);
  });
});
