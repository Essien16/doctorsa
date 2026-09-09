import bcrypt from "bcryptjs";

import { prisma } from "../src/infrastructure/database/prisma.js";
import { UserRole } from "../src/generated/prisma/client.js";

const demoPassword = "password123";
const passwordHash = await bcrypt.hash(demoPassword, 12);

async function main(): Promise<void> {
  const cardiology = await prisma.specialty.upsert({
    where: {
      name: "Cardiology",
    },
    update: {},
    create: {
      name: "Cardiology",
    },
  });

  const dermatology = await prisma.specialty.upsert({
    where: {
      name: "Dermatology",
    },
    update: {},
    create: {
      name: "Dermatology",
    },
  });

  await prisma.specialty.upsert({
    where: {
      name: "General Practice",
    },
    update: {},
    create: {
      name: "General Practice",
    },
  });

  await prisma.user.upsert({
    where: {
      email: "patient@example.com",
    },
    update: {
      name: "Pat Patient",
      passwordHash,
      role: UserRole.PATIENT,
    },
    create: {
      name: "Pat Patient",
      email: "patient@example.com",
      passwordHash,
      role: UserRole.PATIENT,
    },
  });

  const cardiologyDoctor = await prisma.user.upsert({
    where: {
      email: "doctor@example.com",
    },
    update: {
      name: "Dara Doctor",
      passwordHash,
      role: UserRole.DOCTOR,
    },
    create: {
      name: "Dara Doctor",
      email: "doctor@example.com",
      passwordHash,
      role: UserRole.DOCTOR,
    },
  });

  await prisma.doctorProfile.upsert({
    where: {
      userId: cardiologyDoctor.id,
    },
    update: {
      specialtyId: cardiology.id,
    },
    create: {
      userId: cardiologyDoctor.id,
      specialtyId: cardiology.id,
    },
  });

  const dermatologyDoctor = await prisma.user.upsert({
    where: {
      email: "doctor2@example.com",
    },
    update: {
      name: "Sam Doctor",
      passwordHash,
      role: UserRole.DOCTOR,
    },
    create: {
      name: "Sam Doctor",
      email: "doctor2@example.com",
      passwordHash,
      role: UserRole.DOCTOR,
    },
  });

  await prisma.doctorProfile.upsert({
    where: {
      userId: dermatologyDoctor.id,
    },
    update: {
      specialtyId: dermatology.id,
    },
    create: {
      userId: dermatologyDoctor.id,
      specialtyId: dermatology.id,
    },
  });

  console.log("Seed completed.");
  console.log("Patient: patient@example.com / password123");
  console.log("Doctor: doctor@example.com / password123");
  console.log("Doctor: doctor2@example.com / password123");
}

try {
  await main();
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
