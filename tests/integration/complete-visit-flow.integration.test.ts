import { createHmac, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

const databaseUrl = process.env.DATABASE_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;

if (!databaseUrl?.includes("doctorsa_test")) {
  throw new Error("End-to-end tests must use the doctorsa_test database");
}

if (!webhookSecret) {
  throw new Error("WEBHOOK_SECRET must be defined for integration tests");
}

interface TestRecords {
  specialtyId?: string;
  patientId?: string;
  doctorUserId?: string;
  doctorProfileId?: string;
  visitId?: string;
  bidId?: string;
  paymentId?: string;
  providerEventId?: string;
}

interface PaymentSelectionResponse {
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

const app = createApp();

describe("Complete visit booking flow", () => {
  const records: TestRecords = {};

  const uniqueValue = randomUUID();

  const patientEmail = `patient-${uniqueValue}@example.com`;

  const doctorEmail = `doctor-${uniqueValue}@example.com`;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("password123", 10);

    const specialty = await prisma.specialty.create({
      data: {
        name: `Cardiology ${uniqueValue}`,
      },
    });

    records.specialtyId = specialty.id;

    const patient = await prisma.user.create({
      data: {
        name: "Integration Patient",
        email: patientEmail,
        passwordHash,
        role: "PATIENT",
      },
    });

    records.patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        name: "Integration Doctor",
        email: doctorEmail,
        passwordHash,
        role: "DOCTOR",
        doctorProfile: {
          create: {
            specialtyId: specialty.id,
          },
        },
      },
      include: {
        doctorProfile: true,
      },
    });

    records.doctorUserId = doctor.id;
    records.doctorProfileId = doctor.doctorProfile?.id;
  });

  afterAll(async () => {
    /*
     * Cleanup is intentionally explicit because payments have
     * restrictive foreign keys and must be deleted before visits.
     */
    if (records.providerEventId) {
      await prisma.webhookEvent.deleteMany({
        where: {
          providerEventId: records.providerEventId,
        },
      });
    }

    if (records.visitId) {
      await prisma.payment.deleteMany({
        where: {
          visitId: records.visitId,
        },
      });

      await prisma.visit.deleteMany({
        where: {
          id: records.visitId,
        },
      });
    }

    if (records.doctorProfileId) {
      await prisma.doctorProfile.deleteMany({
        where: {
          id: records.doctorProfileId,
        },
      });
    }

    const userIds = [records.patientId, records.doctorUserId].filter(
      (id): id is string => typeof id === "string",
    );

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: userIds,
          },
        },
      });
    }

    if (records.specialtyId) {
      await prisma.specialty.deleteMany({
        where: {
          id: records.specialtyId,
        },
      });
    }

    /*
     * Sessions have no foreign-key relationship with users,
     * so clear them from the isolated test database.
     */
    await prisma.session.deleteMany();

    await prisma.$disconnect();
  });

  it("completes the patient request → doctor bid → payment → assignment flow", async () => {
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

    expect(patientLoginResponse.body.user).toMatchObject({
      id: records.patientId,
      email: patientEmail,
      role: "PATIENT",
    });

    // 2. Patient creates a future visit request.
    const preferredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);

    const createVisitResponse = await patientAgent
      .post("/visits")
      .send({
        specialtyId: records.specialtyId,
        location: "Victoria Island, Lagos",
        preferredAt: preferredAt.toISOString(),
      })
      .expect(201);

    expect(createVisitResponse.body.visit).toMatchObject({
      patientId: records.patientId,
      specialtyId: records.specialtyId,
      location: "Victoria Island, Lagos",
      status: "OPEN",
    });

    records.visitId = createVisitResponse.body.visit.id;

    expect(records.visitId).toEqual(expect.any(String));

    // 3. Doctor logs in.
    const doctorLoginResponse = await doctorAgent
      .post("/auth/login")
      .send({
        email: doctorEmail,
        password: "password123",
      })
      .expect(200);

    expect(doctorLoginResponse.body.user).toMatchObject({
      id: records.doctorUserId,
      email: doctorEmail,
      role: "DOCTOR",
    });

    // 4. The request appears in the doctor's open list.
    const openVisitsResponse = await doctorAgent
      .get("/visits/open")
      .expect(200);

    expect(openVisitsResponse.body.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.visitId,
          specialtyId: records.specialtyId,
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

    expect(submitBidResponse.body.bid).toMatchObject({
      visitId: records.visitId,
      doctorProfileId: records.doctorProfileId,
      amountInKobo: 1_500_000,
      note: "Available at the requested time",
    });

    records.bidId = submitBidResponse.body.bid.id;

    // Submitting the first bid moves the visit to BIDDING.
    const visitAfterBid = await prisma.visit.findUnique({
      where: {
        id: records.visitId,
      },
    });

    expect(visitAfterBid?.status).toBe("BIDDING");

    // 6. Patient can view the doctor's bid.
    const visitDetailsResponse = await patientAgent
      .get(`/visits/${records.visitId}`)
      .expect(200);

    expect(visitDetailsResponse.body.visit).toMatchObject({
      id: records.visitId,
      status: "BIDDING",
    });

    expect(visitDetailsResponse.body.visit.bids).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.bidId,
          doctorName: "Integration Doctor",
          amountInKobo: 1_500_000,
        }),
      ]),
    );

    // 7. Patient selects the bid and starts payment.
    const selectionResponse = await patientAgent
      .post(`/visits/${records.visitId}/bids/${records.bidId}/select`)
      .expect(201);

    const selection = selectionResponse.body as PaymentSelectionResponse;

    expect(selection.payment).toMatchObject({
      visitId: records.visitId,
      bidId: records.bidId,
      amountInKobo: 1_500_000,
      status: "PENDING",
    });

    expect(selection.checkoutUrl).toEqual(
      expect.stringContaining("/mock-payments/"),
    );

    records.paymentId = selection.payment.id;

    const selectedVisit = await prisma.visit.findUnique({
      where: {
        id: records.visitId,
      },
    });

    expect(selectedVisit).toMatchObject({
      status: "BIDDING",
      selectedBidId: records.bidId,
      reservedDoctorProfileId: records.doctorProfileId,
    });

    // 8. The mock provider confirms payment via webhook.
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

    // 9. Payment succeeds and the visit is assigned.
    const completedPayment = await prisma.payment.findUnique({
      where: {
        id: records.paymentId,
      },
    });

    expect(completedPayment?.status).toBe("SUCCEEDED");
    expect(completedPayment?.paidAt).toBeInstanceOf(Date);

    const assignedVisit = await prisma.visit.findUnique({
      where: {
        id: records.visitId,
      },
    });

    expect(assignedVisit).toMatchObject({
      status: "ASSIGNED",
      selectedBidId: records.bidId,
      assignedDoctorProfileId: records.doctorProfileId,
    });

    // 10. The assigned visit appears on the doctor's list.
    const assignedVisitsResponse = await doctorAgent
      .get("/visits/assigned")
      .expect(200);

    expect(assignedVisitsResponse.body.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: records.visitId,
          patientName: "Integration Patient",
          specialtyName: `Cardiology ${uniqueValue}`,
          amountInKobo: 1_500_000,
        }),
      ]),
    );

    // 11. Sending the same event again is safely ignored.
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

    // 12. Duplicate delivery created no duplicate effects.
    const webhookEventCount = await prisma.webhookEvent.count({
      where: {
        providerEventId: records.providerEventId,
      },
    });

    expect(webhookEventCount).toBe(1);

    const statusHistory = await prisma.visitStatusHistory.findMany({
      where: {
        visitId: records.visitId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        fromStatus: true,
        toStatus: true,
      },
    });

    expect(statusHistory).toEqual([
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
