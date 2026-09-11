import { createHmac, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import request from "supertest";

import { createApp } from "../../src/app.js";
import {
  closeMySqlConnection,
  mysqlPool,
} from "../../src/infrastructure/database/mysql.js";
import { withTransaction } from "../../src/infrastructure/database/transaction.js";

const databaseUrl = process.env.MYSQL_DATABASE_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;

if (!databaseUrl?.includes("doctorsa_test")) {
  throw new Error("End-to-end tests must use the doctorsa_test MySQL database");
}

if (!webhookSecret) {
  throw new Error("WEBHOOK_SECRET must be defined for integration tests");
}

interface TestRecords {
  visitId?: string;
  bidId?: string;
  paymentId?: string;
  providerEventId?: string;
}

interface LoginResponseBody {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface CreateVisitResponseBody {
  visit: {
    id: string;
    patientId: string;
    specialtyId: string;
    location: string;
    status: string;
  };
}

interface SubmitBidResponseBody {
  bid: {
    id: string;
    visitId: string;
    doctorProfileId: string;
    amountInKobo: number;
    note: string;
  };
}

interface PaymentSelectionResponseBody {
  payment: {
    id: string;
    visitId: string;
    bidId: string;
    providerReference: string;
    amountInKobo: number;
    status: string;
  };
  checkoutUrl: string;
}

interface VisitStatusRow extends RowDataPacket {
  status: string;
}

interface SelectedVisitRow extends RowDataPacket {
  status: string;
  selectedBidId: string | null;
  reservedDoctorProfileId: string | null;
  assignedDoctorProfileId: string | null;
}

interface PaymentStateRow extends RowDataPacket {
  status: string;
  paidAt: Date | null;
}

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface StatusHistoryRow extends RowDataPacket {
  fromStatus: string | null;
  toStatus: string;
}

const app = createApp();

describe("Complete visit booking flow with MySQL", () => {
  const records: TestRecords = {};

  const uniqueValue = randomUUID();

  const specialtyId = randomUUID();
  const patientId = randomUUID();
  const doctorUserId = randomUUID();
  const doctorProfileId = randomUUID();

  const patientEmail = `patient-${uniqueValue}@example.com`;

  const doctorEmail = `doctor-${uniqueValue}@example.com`;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("password123", 10);

    await withTransaction(mysqlPool, async (connection) => {
      await connection.execute(
        `
            INSERT INTO specialties (
              id,
              name
            )
            VALUES (?, ?)
          `,
        [specialtyId, `Cardiology ${uniqueValue}`],
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
        [patientId, "Integration Patient", patientEmail, passwordHash],
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
        [doctorUserId, "Integration Doctor", doctorEmail, passwordHash],
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
        [doctorProfileId, doctorUserId, specialtyId],
      );
    });
  });

  afterAll(async () => {
    try {
      /*
       * Sessions do not have user foreign keys and may
       * therefore be removed independently.
       */
      await mysqlPool.execute(
        `
          DELETE FROM sessions
        `,
      );

      if (records.providerEventId) {
        await mysqlPool.execute(
          `
            DELETE FROM webhook_events
            WHERE provider_event_id = ?
          `,
          [records.providerEventId],
        );
      }

      if (records.visitId) {
        /*
         * Payments must be removed before visits because
         * their foreign key uses restrictive deletion.
         */
        await mysqlPool.execute(
          `
            DELETE FROM payments
            WHERE visit_id = ?
          `,
          [records.visitId],
        );

        /*
         * Deleting the visit also deletes its bids and
         * status history through cascading foreign keys.
         */
        await mysqlPool.execute(
          `
            DELETE FROM visits
            WHERE id = ?
          `,
          [records.visitId],
        );
      }

      await mysqlPool.execute(
        `
          DELETE FROM doctor_profiles
          WHERE id = ?
        `,
        [doctorProfileId],
      );

      await mysqlPool.execute(
        `
          DELETE FROM users
          WHERE id IN (?, ?)
        `,
        [patientId, doctorUserId],
      );

      await mysqlPool.execute(
        `
          DELETE FROM specialties
          WHERE id = ?
        `,
        [specialtyId],
      );
    } finally {
      await closeMySqlConnection();
    }
  });

  it("completes patient request → doctor bid → payment → assignment", async () => {
    const patientAgent = request.agent(app);
    const doctorAgent = request.agent(app);

    // 1. Patient logs in.
    const patientLoginResponse = await patientAgent
      .post("/auth/login")
      .send({
        email: patientEmail,
        password: "password123",
      })
      .expect(200);

    const patientLogin = patientLoginResponse.body as LoginResponseBody;

    expect(patientLogin.user).toMatchObject({
      id: patientId,
      email: patientEmail,
      role: "PATIENT",
    });

    // 2. Patient creates a future visit.
    const preferredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);

    const createVisitResponse = await patientAgent
      .post("/visits")
      .send({
        specialtyId,
        location: "Victoria Island, Lagos",
        preferredAt: preferredAt.toISOString(),
      })
      .expect(201);

    const createVisit = createVisitResponse.body as CreateVisitResponseBody;

    expect(createVisit.visit).toMatchObject({
      patientId,
      specialtyId,
      location: "Victoria Island, Lagos",
      status: "OPEN",
    });

    records.visitId = createVisit.visit.id;

    expect(records.visitId).toEqual(expect.any(String));

    // 3. Doctor logs in.
    const doctorLoginResponse = await doctorAgent
      .post("/auth/login")
      .send({
        email: doctorEmail,
        password: "password123",
      })
      .expect(200);

    const doctorLogin = doctorLoginResponse.body as LoginResponseBody;

    expect(doctorLogin.user).toMatchObject({
      id: doctorUserId,
      email: doctorEmail,
      role: "DOCTOR",
    });

    // 4. Doctor sees the matching open request.
    const openVisitsResponse = await doctorAgent
      .get("/visits/open")
      .expect(200);

    const openVisitsBody = openVisitsResponse.body as {
      visits: Array<{
        id: string;
        specialtyId: string;
        status: string;
      }>;
    };

    expect(openVisitsBody.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.visitId,
          specialtyId,
          status: "OPEN",
        }),
      ]),
    );

    // 5. Doctor submits a bid.
    const submitBidResponse = await doctorAgent
      .post(`/visits/${records.visitId}/bids`)
      .send({
        amountInKobo: 1_500_000,
        note: "Available at the requested time",
      })
      .expect(200);

    const submitBid = submitBidResponse.body as SubmitBidResponseBody;

    expect(submitBid.bid).toMatchObject({
      visitId: records.visitId,
      doctorProfileId,
      amountInKobo: 1_500_000,
      note: "Available at the requested time",
    });

    records.bidId = submitBid.bid.id;

    // The first bid changes OPEN to BIDDING.
    const [visitAfterBidRows] = await mysqlPool.execute<VisitStatusRow[]>(
      `
            SELECT status
            FROM visits
            WHERE id = ?
            LIMIT 1
          `,
      [records.visitId],
    );

    expect(visitAfterBidRows[0]?.status).toBe("BIDDING");

    // 6. Patient sees the doctor's bid.
    const visitDetailsResponse = await patientAgent
      .get(`/visits/${records.visitId}`)
      .expect(200);

    const visitDetails = visitDetailsResponse.body as {
      visit: {
        id: string;
        status: string;
        bids: Array<{
          id: string;
          doctorName: string;
          amountInKobo: number;
        }>;
      };
    };

    expect(visitDetails.visit).toMatchObject({
      id: records.visitId,
      status: "BIDDING",
    });

    expect(visitDetails.visit.bids).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.bidId,
          doctorName: "Integration Doctor",
          amountInKobo: 1_500_000,
        }),
      ]),
    );

    // 7. Patient selects the bid.
    const selectionResponse = await patientAgent
      .post(`/visits/${records.visitId}/bids/${records.bidId}/select`)
      .expect(201);

    const selection = selectionResponse.body as PaymentSelectionResponseBody;

    expect(selection.payment).toMatchObject({
      visitId: records.visitId,
      bidId: records.bidId,
      amountInKobo: 1_500_000,
      status: "PENDING",
    });

    expect(selection.checkoutUrl).toContain("/mock-payments/");

    records.paymentId = selection.payment.id;

    const [selectedVisitRows] = await mysqlPool.execute<SelectedVisitRow[]>(
      `
            SELECT
              status,
              selected_bid_id AS selectedBidId,
              reserved_doctor_profile_id
                AS reservedDoctorProfileId,
              assigned_doctor_profile_id
                AS assignedDoctorProfileId
            FROM visits
            WHERE id = ?
            LIMIT 1
          `,
      [records.visitId],
    );

    expect(selectedVisitRows[0]).toMatchObject({
      status: "BIDDING",
      selectedBidId: records.bidId,
      reservedDoctorProfileId: doctorProfileId,
      assignedDoctorProfileId: null,
    });

    // 8. Mock provider sends a successful webhook.
    records.providerEventId = `evt_${randomUUID()}`;

    const paymentEvent = {
      id: records.providerEventId,
      type: "payment.succeeded",
      data: {
        paymentId: records.paymentId,
        providerReference: selection.payment.providerReference,
      },
    };

    const rawEvent = JSON.stringify(paymentEvent);

    const signature = createHmac("sha256", webhookSecret)
      .update(rawEvent)
      .digest("hex");

    const firstWebhookResponse = await request(app)
      .post("/webhooks/payments")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signature)
      .send(rawEvent)
      .expect(200);

    expect(firstWebhookResponse.body).toEqual({
      received: true,
      duplicate: false,
      alreadyProcessed: false,
    });

    // 9. Payment succeeds.
    const [paymentRows] = await mysqlPool.execute<PaymentStateRow[]>(
      `
            SELECT
              status,
              paid_at AS paidAt
            FROM payments
            WHERE id = ?
            LIMIT 1
          `,
      [records.paymentId],
    );

    expect(paymentRows[0]?.status).toBe("SUCCEEDED");

    expect(paymentRows[0]?.paidAt).toBeInstanceOf(Date);

    // 10. Reservation becomes final assignment.
    const [assignedVisitRows] = await mysqlPool.execute<SelectedVisitRow[]>(
      `
            SELECT
              status,
              selected_bid_id AS selectedBidId,
              reserved_doctor_profile_id
                AS reservedDoctorProfileId,
              assigned_doctor_profile_id
                AS assignedDoctorProfileId
            FROM visits
            WHERE id = ?
            LIMIT 1
          `,
      [records.visitId],
    );

    expect(assignedVisitRows[0]).toMatchObject({
      status: "ASSIGNED",
      selectedBidId: records.bidId,
      reservedDoctorProfileId: null,
      assignedDoctorProfileId: doctorProfileId,
    });

    // 11. Doctor sees the assigned visit.
    const assignedVisitsResponse = await doctorAgent
      .get("/visits/assigned")
      .expect(200);

    const assignedVisits = assignedVisitsResponse.body as {
      visits: Array<{
        id: string;
        patientName: string;
        specialtyName: string;
        amountInKobo: number;
      }>;
    };

    expect(assignedVisits.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.visitId,
          patientName: "Integration Patient",
          specialtyName: `Cardiology ${uniqueValue}`,
          amountInKobo: 1_500_000,
        }),
      ]),
    );

    // 12. Duplicate webhook is safely ignored.
    const duplicateWebhookResponse = await request(app)
      .post("/webhooks/payments")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signature)
      .send(rawEvent)
      .expect(200);

    expect(duplicateWebhookResponse.body).toEqual({
      received: true,
      duplicate: true,
      alreadyProcessed: false,
    });

    // 13. No duplicate database effects exist.
    const [webhookCountRows] = await mysqlPool.execute<CountRow[]>(
      `
            SELECT COUNT(*) AS count
            FROM webhook_events
            WHERE provider_event_id = ?
          `,
      [records.providerEventId],
    );

    expect(Number(webhookCountRows[0]?.count)).toBe(1);

    const [historyRows] = await mysqlPool.execute<StatusHistoryRow[]>(
      `
            SELECT
              from_status AS fromStatus,
              to_status AS toStatus
            FROM visit_status_history
            WHERE visit_id = ?
            ORDER BY created_at ASC
          `,
      [records.visitId],
    );

    expect(historyRows).toEqual([
      {
        fromStatus: null,
        toStatus: "OPEN",
      },
      {
        fromStatus: "OPEN",
        toStatus: "BIDDING",
      },
      {
        fromStatus: "BIDDING",
        toStatus: "PAID",
      },
      {
        fromStatus: "PAID",
        toStatus: "ASSIGNED",
      },
    ]);
  }, 20_000);
});
