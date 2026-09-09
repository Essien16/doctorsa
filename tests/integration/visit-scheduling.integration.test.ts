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

describe("Visit scheduling constraints", () => {
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
    await prisma.visit.deleteMany({
      where: {
        OR: [
          {
            patientId: ids.firstPatientId,
          },
          {
            patientId: ids.secondPatientId,
          },
        ],
      },
    });

    await prisma.doctorProfile.deleteMany({
      where: {
        id: {
          in: [ids.firstDoctorProfileId, ids.secondDoctorProfileId],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            ids.firstPatientId,
            ids.secondPatientId,
            ids.firstDoctorUserId,
            ids.secondDoctorUserId,
          ],
        },
      },
    });

    await prisma.specialty.deleteMany({
      where: {
        id: ids.specialtyId,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await cleanUp();

    await prisma.specialty.create({
      data: {
        id: ids.specialtyId,
        name: `Scheduling Specialty ${ids.specialtyId}`,
      },
    });

    await prisma.user.createMany({
      data: [
        {
          id: ids.firstPatientId,
          name: "First Test Patient",
          email: `first-patient-${ids.firstPatientId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "PATIENT",
        },
        {
          id: ids.secondPatientId,
          name: "Second Test Patient",
          email: `second-patient-${ids.secondPatientId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "PATIENT",
        },
        {
          id: ids.firstDoctorUserId,
          name: "First Test Doctor",
          email: `first-doctor-${ids.firstDoctorUserId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "DOCTOR",
        },
        {
          id: ids.secondDoctorUserId,
          name: "Second Test Doctor",
          email: `second-doctor-${ids.secondDoctorUserId}@example.com`,
          passwordHash: "unused-test-hash",
          role: "DOCTOR",
        },
      ],
    });

    await prisma.doctorProfile.createMany({
      data: [
        {
          id: ids.firstDoctorProfileId,
          userId: ids.firstDoctorUserId,
          specialtyId: ids.specialtyId,
        },
        {
          id: ids.secondDoctorProfileId,
          userId: ids.secondDoctorUserId,
          specialtyId: ids.specialtyId,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("prevents a patient from having overlapping visits", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "OPEN",
      },
    });

    const overlappingStart = new Date("2031-10-10T11:30:00.000Z");

    const overlappingEnd = new Date("2031-10-10T12:30:00.000Z");

    await expect(
      prisma.visit.create({
        data: {
          patientId: ids.firstPatientId,
          specialtyId: ids.specialtyId,
          location: "Victoria Island",
          preferredAt: overlappingStart,
          scheduledEndAt: overlappingEnd,
          status: "OPEN",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows a patient visit to start when the previous visit ends", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "OPEN",
      },
    });

    const nextVisitEnd = new Date("2031-10-10T13:00:00.000Z");

    await expect(
      prisma.visit.create({
        data: {
          patientId: ids.firstPatientId,
          specialtyId: ids.specialtyId,
          location: "Victoria Island",
          preferredAt: endAt,
          scheduledEndAt: nextVisitEnd,
          status: "OPEN",
        },
      }),
    ).resolves.toMatchObject({
      patientId: ids.firstPatientId,
      preferredAt: endAt,
      scheduledEndAt: nextVisitEnd,
    });
  });

  it("allows different patients to request overlapping visits", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "OPEN",
      },
    });

    await expect(
      prisma.visit.create({
        data: {
          patientId: ids.secondPatientId,
          specialtyId: ids.specialtyId,
          location: "Ikoyi",
          preferredAt: startAt,
          scheduledEndAt: endAt,
          status: "OPEN",
        },
      }),
    ).resolves.toMatchObject({
      patientId: ids.secondPatientId,
    });
  });

  it("prevents a doctor from being reserved for overlapping visits", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        reservedDoctorProfileId: ids.firstDoctorProfileId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "BIDDING",
      },
    });

    const overlappingVisit = await prisma.visit.create({
      data: {
        patientId: ids.secondPatientId,
        specialtyId: ids.specialtyId,
        location: "Ikoyi",
        preferredAt: new Date("2031-10-10T11:30:00.000Z"),
        scheduledEndAt: new Date("2031-10-10T12:30:00.000Z"),
        status: "BIDDING",
      },
    });

    await expect(
      prisma.visit.update({
        where: {
          id: overlappingVisit.id,
        },
        data: {
          reservedDoctorProfileId: ids.firstDoctorProfileId,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows different doctors to be reserved at the same time", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        reservedDoctorProfileId: ids.firstDoctorProfileId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "BIDDING",
      },
    });

    await expect(
      prisma.visit.create({
        data: {
          patientId: ids.secondPatientId,
          specialtyId: ids.specialtyId,
          reservedDoctorProfileId: ids.secondDoctorProfileId,
          location: "Ikoyi",
          preferredAt: startAt,
          scheduledEndAt: endAt,
          status: "BIDDING",
        },
      }),
    ).resolves.toMatchObject({
      reservedDoctorProfileId: ids.secondDoctorProfileId,
    });
  });

  it("allows a doctor appointment to start when the previous one ends", async () => {
    await prisma.visit.create({
      data: {
        patientId: ids.firstPatientId,
        specialtyId: ids.specialtyId,
        reservedDoctorProfileId: ids.firstDoctorProfileId,
        location: "Lekki",
        preferredAt: startAt,
        scheduledEndAt: endAt,
        status: "ASSIGNED",
      },
    });

    await expect(
      prisma.visit.create({
        data: {
          patientId: ids.secondPatientId,
          specialtyId: ids.specialtyId,
          reservedDoctorProfileId: ids.firstDoctorProfileId,
          location: "Ikoyi",
          preferredAt: endAt,
          scheduledEndAt: new Date("2031-10-10T13:00:00.000Z"),
          status: "ASSIGNED",
        },
      }),
    ).resolves.toMatchObject({
      reservedDoctorProfileId: ids.firstDoctorProfileId,
      preferredAt: endAt,
    });
  });
});
