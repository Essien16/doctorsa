import "dotenv/config";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPaymentRepository } from "../../src/modules/payments/infrastructure/prisma-payment.repository.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.includes("doctorsa_test")) {
  throw new Error("Integration tests must use the doctorsa_test database");
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

const paymentRepository = new PrismaPaymentRepository(prisma);

describe("PrismaPaymentRepository webhook processing", () => {
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

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany({
      where: {
        providerEventId: event.id,
      },
    });

    await prisma.visitStatusHistory.deleteMany({
      where: {
        visitId: ids.visitId,
      },
    });

    await prisma.payment.deleteMany({
      where: {
        id: ids.paymentId,
      },
    });

    await prisma.visit.deleteMany({
      where: {
        id: ids.visitId,
      },
    });

    await prisma.bid.deleteMany({
      where: {
        id: ids.bidId,
      },
    });

    await prisma.doctorProfile.deleteMany({
      where: {
        id: ids.doctorProfileId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ids.patientId, ids.doctorUserId],
        },
      },
    });

    await prisma.specialty.deleteMany({
      where: {
        id: ids.specialtyId,
      },
    });

    const preferredAt = new Date("2030-09-15T11:00:00.000Z");

    const scheduledEndAt = new Date("2030-09-15T12:00:00.000Z");

    await prisma.specialty.create({
      data: {
        id: ids.specialtyId,
        name: `Integration Specialty ${ids.specialtyId}`,
      },
    });

    await prisma.user.createMany({
      data: [
        {
          id: ids.patientId,
          name: "Integration Patient",
          email: `patient-${ids.patientId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "PATIENT",
        },
        {
          id: ids.doctorUserId,
          name: "Integration Doctor",
          email: `doctor-${ids.doctorUserId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "DOCTOR",
        },
      ],
    });

    await prisma.doctorProfile.create({
      data: {
        id: ids.doctorProfileId,
        userId: ids.doctorUserId,
        specialtyId: ids.specialtyId,
      },
    });

    await prisma.visit.create({
      data: {
        id: ids.visitId,
        patientId: ids.patientId,
        specialtyId: ids.specialtyId,
        location: "Integration Test Location",
        preferredAt,
        scheduledEndAt,
        status: "BIDDING",
      },
    });

    await prisma.bid.create({
      data: {
        id: ids.bidId,
        visitId: ids.visitId,
        doctorProfileId: ids.doctorProfileId,
        amountInKobo: 1_500_000,
        note: "Integration test bid",
      },
    });

    await prisma.visit.update({
      where: {
        id: ids.visitId,
      },
      data: {
        selectedBidId: ids.bidId,
        reservedDoctorProfileId: ids.doctorProfileId,
      },
    });

    await prisma.payment.create({
      data: {
        id: ids.paymentId,
        visitId: ids.visitId,
        bidId: ids.bidId,
        providerReference,
        amountInKobo: 1_500_000,
        status: "PENDING",
      },
    });

    await prisma.visitStatusHistory.createMany({
      data: [
        {
          visitId: ids.visitId,
          fromStatus: null,
          toStatus: "OPEN",
        },
        {
          visitId: ids.visitId,
          fromStatus: "OPEN",
          toStatus: "BIDDING",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({
      where: {
        providerEventId: event.id,
      },
    });

    await prisma.visitStatusHistory.deleteMany({
      where: {
        visitId: ids.visitId,
      },
    });

    await prisma.payment.deleteMany({
      where: {
        id: ids.paymentId,
      },
    });

    await prisma.visit.deleteMany({
      where: {
        id: ids.visitId,
      },
    });

    await prisma.bid.deleteMany({
      where: {
        id: ids.bidId,
      },
    });

    await prisma.doctorProfile.deleteMany({
      where: {
        id: ids.doctorProfileId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ids.patientId, ids.doctorUserId],
        },
      },
    });

    await prisma.specialty.deleteMany({
      where: {
        id: ids.specialtyId,
      },
    });

    await prisma.$disconnect();
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

    const payment = await prisma.payment.findUniqueOrThrow({
      where: {
        id: ids.paymentId,
      },
    });

    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.paidAt).not.toBeNull();

    const visit = await prisma.visit.findUniqueOrThrow({
      where: {
        id: ids.visitId,
      },
    });

    expect(visit.status).toBe("ASSIGNED");
    expect(visit.assignedDoctorProfileId).toBe(ids.doctorProfileId);

    const webhookEventCount = await prisma.webhookEvent.count({
      where: {
        providerEventId: event.id,
      },
    });

    expect(webhookEventCount).toBe(1);

    const paidTransitionCount = await prisma.visitStatusHistory.count({
      where: {
        visitId: ids.visitId,
        fromStatus: "BIDDING",
        toStatus: "PAID",
      },
    });

    const assignedTransitionCount = await prisma.visitStatusHistory.count({
      where: {
        visitId: ids.visitId,
        fromStatus: "PAID",
        toStatus: "ASSIGNED",
      },
    });

    expect(paidTransitionCount).toBe(1);
    expect(assignedTransitionCount).toBe(1);
  });
});
