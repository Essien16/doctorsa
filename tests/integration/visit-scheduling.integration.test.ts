import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";

import {
  closeMySqlConnection,
  mysqlPool,
} from "../../src/infrastructure/database/mysql.js";
import { withTransaction } from "../../src/infrastructure/database/transaction.js";
import type { Bid } from "../../src/modules/visits/domain/bid.js";
import type { Visit } from "../../src/modules/visits/domain/visit.js";
import { MySqlPaymentRepository } from "../../src/modules/payments/infrastructure/mysql-payment.repository.js";
import { MySqlVisitRepository } from "../../src/modules/visits/infrastructure/mysql-visit.repository.js";

const databaseUrl = process.env.MYSQL_DATABASE_URL;

if (!databaseUrl?.includes("doctorsa_test")) {
  throw new Error(
    "Integration tests must use the doctorsa_test MySQL database",
  );
}

const visitRepository = new MySqlVisitRepository(mysqlPool);

const paymentRepository = new MySqlPaymentRepository(mysqlPool);

describe("MySQL visit scheduling rules", () => {
  const ids = {
    specialtyId: randomUUID(),
    firstPatientId: randomUUID(),
    secondPatientId: randomUUID(),
    firstDoctorUserId: randomUUID(),
    secondDoctorUserId: randomUUID(),
    firstDoctorProfileId: randomUUID(),
    secondDoctorProfileId: randomUUID(),
  };

  const startAt = new Date("2031-10-10T11:00:00.000Z");

  const endAt = new Date("2031-10-10T12:00:00.000Z");

  async function cleanUp(): Promise<void> {
    await withTransaction(mysqlPool, async (connection) => {
      /*
       * Delete in foreign-key dependency order:
       * payments → selected bids → bids/history → visits.
       */
      await connection.execute(
        `
          DELETE FROM payments
          WHERE visit_id IN (
            SELECT id
            FROM visits
            WHERE patient_id IN (?, ?)
          )
        `,
        [ids.firstPatientId, ids.secondPatientId],
      );

      await connection.execute(
        `
          UPDATE visits
          SET selected_bid_id = NULL
          WHERE patient_id IN (?, ?)
        `,
        [ids.firstPatientId, ids.secondPatientId],
      );

      await connection.execute(
        `
          DELETE FROM bids
          WHERE visit_id IN (
            SELECT id
            FROM visits
            WHERE patient_id IN (?, ?)
          )
        `,
        [ids.firstPatientId, ids.secondPatientId],
      );

      await connection.execute(
        `
          DELETE FROM visit_status_history
          WHERE visit_id IN (
            SELECT id
            FROM visits
            WHERE patient_id IN (?, ?)
          )
        `,
        [ids.firstPatientId, ids.secondPatientId],
      );

      await connection.execute(
        `
          DELETE FROM visits
          WHERE patient_id IN (?, ?)
        `,
        [ids.firstPatientId, ids.secondPatientId],
      );

      await connection.execute(
        `
          DELETE FROM doctor_profiles
          WHERE id IN (?, ?)
        `,
        [ids.firstDoctorProfileId, ids.secondDoctorProfileId],
      );

      await connection.execute(
        `
          DELETE FROM users
          WHERE id IN (?, ?, ?, ?)
        `,
        [
          ids.firstPatientId,
          ids.secondPatientId,
          ids.firstDoctorUserId,
          ids.secondDoctorUserId,
        ],
      );

      await connection.execute(
        `
          DELETE FROM specialties
          WHERE id = ?
        `,
        [ids.specialtyId],
      );
    });
  }

  async function createVisit(
    patientId: string,
    preferredAt: Date,
    location: string,
  ): Promise<Visit> {
    const result = await visitRepository.create({
      patientId,
      specialtyId: ids.specialtyId,
      location,
      preferredAt,
    });

    if (!result.success) {
      throw new Error(`Could not create test visit: ${result.reason}`);
    }

    return result.visit;
  }

  async function submitBid(
    visitId: string,
    doctorUserId: string,
  ): Promise<Bid> {
    const result = await visitRepository.submitBid({
      visitId,
      doctorUserId,
      amountInKobo: 1_500_000,
      note: "Scheduling integration test",
    });

    if (!result.success) {
      throw new Error(`Could not create test bid: ${result.reason}`);
    }

    return result.bid;
  }

  beforeEach(async () => {
    await cleanUp();

    await withTransaction(mysqlPool, async (connection) => {
      await connection.execute(
        `
            INSERT INTO specialties (
              id,
              name
            )
            VALUES (?, ?)
          `,
        [ids.specialtyId, `Scheduling Specialty ${ids.specialtyId}`],
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
            VALUES
              (?, ?, ?, ?, 'PATIENT'),
              (?, ?, ?, ?, 'PATIENT'),
              (?, ?, ?, ?, 'DOCTOR'),
              (?, ?, ?, ?, 'DOCTOR')
          `,
        [
          ids.firstPatientId,
          "First Test Patient",
          `first-patient-${ids.firstPatientId}@example.com`,
          "unused-test-hash",

          ids.secondPatientId,
          "Second Test Patient",
          `second-patient-${ids.secondPatientId}@example.com`,
          "unused-test-hash",

          ids.firstDoctorUserId,
          "First Test Doctor",
          `first-doctor-${ids.firstDoctorUserId}@example.com`,
          "unused-test-hash",

          ids.secondDoctorUserId,
          "Second Test Doctor",
          `second-doctor-${ids.secondDoctorUserId}@example.com`,
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
            VALUES
              (?, ?, ?),
              (?, ?, ?)
          `,
        [
          ids.firstDoctorProfileId,
          ids.firstDoctorUserId,
          ids.specialtyId,

          ids.secondDoctorProfileId,
          ids.secondDoctorUserId,
          ids.specialtyId,
        ],
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

  it("prevents a patient from having overlapping visits", async () => {
    const firstVisit = await visitRepository.create({
      patientId: ids.firstPatientId,
      specialtyId: ids.specialtyId,
      location: "Lekki",
      preferredAt: startAt,
    });

    expect(firstVisit.success).toBe(true);

    const overlappingVisit = await visitRepository.create({
      patientId: ids.firstPatientId,
      specialtyId: ids.specialtyId,
      location: "Victoria Island",
      preferredAt: new Date("2031-10-10T11:30:00.000Z"),
    });

    expect(overlappingVisit).toEqual({
      success: false,
      reason: "PATIENT_SCHEDULE_CONFLICT",
    });
  });

  it("serializes concurrent overlapping requests for one patient", async () => {
    const results = await Promise.all([
      visitRepository.create({
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        location: "Lekki",
        preferredAt: startAt,
      }),
      visitRepository.create({
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        location: "Ikoyi",
        preferredAt: startAt,
      }),
    ]);

    const successfulResults = results.filter((result) => result.success);

    const conflictResults = results.filter((result) => !result.success);

    expect(successfulResults).toHaveLength(1);

    expect(conflictResults).toEqual([
      {
        success: false,
        reason: "PATIENT_SCHEDULE_CONFLICT",
      },
    ]);
  });

  it("allows a patient visit to start when the previous visit ends", async () => {
    const firstVisit = await createVisit(ids.firstPatientId, startAt, "Lekki");

    expect(firstVisit.preferredAt).toEqual(startAt);

    const nextVisit = await createVisit(
      ids.firstPatientId,
      endAt,
      "Victoria Island",
    );

    expect(nextVisit).toMatchObject({
      patientId: ids.firstPatientId,
      preferredAt: endAt,
    });
  });

  it("allows different patients to request overlapping visits", async () => {
    const firstVisit = await createVisit(ids.firstPatientId, startAt, "Lekki");

    const secondVisit = await createVisit(
      ids.secondPatientId,
      startAt,
      "Ikoyi",
    );

    expect(firstVisit.patientId).toBe(ids.firstPatientId);

    expect(secondVisit.patientId).toBe(ids.secondPatientId);
  });

  it("prevents concurrent reservations of one doctor for overlapping visits", async () => {
    const firstVisit = await createVisit(ids.firstPatientId, startAt, "Lekki");

    const secondVisit = await createVisit(
      ids.secondPatientId,
      new Date("2031-10-10T11:30:00.000Z"),
      "Ikoyi",
    );

    const firstBid = await submitBid(firstVisit.id, ids.firstDoctorUserId);

    const secondBid = await submitBid(secondVisit.id, ids.firstDoctorUserId);

    const results = await Promise.all([
      paymentRepository.selectBidAndCreatePayment({
        patientId: ids.firstPatientId,
        visitId: firstVisit.id,
        bidId: firstBid.id,
        providerReference: `mock_${randomUUID()}`,
      }),

      paymentRepository.selectBidAndCreatePayment({
        patientId: ids.secondPatientId,
        visitId: secondVisit.id,
        bidId: secondBid.id,
        providerReference: `mock_${randomUUID()}`,
      }),
    ]);

    const successfulResults = results.filter((result) => result.success);

    const conflictResults = results.filter((result) => !result.success);

    expect(successfulResults).toHaveLength(1);

    expect(conflictResults).toEqual([
      {
        success: false,
        reason: "DOCTOR_SCHEDULE_CONFLICT",
      },
    ]);
  });

  it("allows different doctors to be reserved at the same time", async () => {
    const firstVisit = await createVisit(ids.firstPatientId, startAt, "Lekki");

    const secondVisit = await createVisit(
      ids.secondPatientId,
      startAt,
      "Ikoyi",
    );

    const firstBid = await submitBid(firstVisit.id, ids.firstDoctorUserId);

    const secondBid = await submitBid(secondVisit.id, ids.secondDoctorUserId);

    const [firstResult, secondResult] = await Promise.all([
      paymentRepository.selectBidAndCreatePayment({
        patientId: ids.firstPatientId,
        visitId: firstVisit.id,
        bidId: firstBid.id,
        providerReference: `mock_${randomUUID()}`,
      }),

      paymentRepository.selectBidAndCreatePayment({
        patientId: ids.secondPatientId,
        visitId: secondVisit.id,
        bidId: secondBid.id,
        providerReference: `mock_${randomUUID()}`,
      }),
    ]);

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(true);
  });

  it("allows a doctor appointment to start when the previous one ends", async () => {
    const firstVisit = await createVisit(ids.firstPatientId, startAt, "Lekki");

    const secondVisit = await createVisit(ids.secondPatientId, endAt, "Ikoyi");

    const firstBid = await submitBid(firstVisit.id, ids.firstDoctorUserId);

    const secondBid = await submitBid(secondVisit.id, ids.firstDoctorUserId);

    const firstSelection = await paymentRepository.selectBidAndCreatePayment({
      patientId: ids.firstPatientId,
      visitId: firstVisit.id,
      bidId: firstBid.id,
      providerReference: `mock_${randomUUID()}`,
    });

    const secondSelection = await paymentRepository.selectBidAndCreatePayment({
      patientId: ids.secondPatientId,
      visitId: secondVisit.id,
      bidId: secondBid.id,
      providerReference: `mock_${randomUUID()}`,
    });

    expect(firstSelection.success).toBe(true);
    expect(secondSelection.success).toBe(true);
  });
});
