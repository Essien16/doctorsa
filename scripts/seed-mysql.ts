import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  closeMySqlConnection,
  mysqlPool,
} from "../src/infrastructure/database/mysql.js";
import { withTransaction } from "../src/infrastructure/database/transaction.js";

interface IdRow extends RowDataPacket {
  id: string;
}

interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role: "PATIENT" | "DOCTOR";
}

async function findSpecialtyIdByName(
  connection: PoolConnection,
  name: string,
): Promise<string> {
  const [rows] = await connection.execute<IdRow[]>(
    `
      SELECT id
      FROM specialties
      WHERE name = ?
      LIMIT 1
    `,
    [name],
  );

  const specialty = rows[0];

  if (!specialty) {
    throw new Error(`Could not find specialty: ${name}`);
  }

  return specialty.id;
}

async function findUserIdByEmail(
  connection: PoolConnection,
  email: string,
): Promise<string> {
  const [rows] = await connection.execute<IdRow[]>(
    `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );

  const user = rows[0];

  if (!user) {
    throw new Error(`Could not find user: ${email}`);
  }

  return user.id;
}

async function upsertSpecialty(
  connection: PoolConnection,
  name: string,
): Promise<string> {
  await connection.execute(
    `
      INSERT INTO specialties (
        id,
        name
      )
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        name = ?
    `,
    [randomUUID(), name, name],
  );

  return findSpecialtyIdByName(connection, name);
}

async function upsertUser(
  connection: PoolConnection,
  data: CreateUserData,
): Promise<string> {
  await connection.execute(
    `
      INSERT INTO users (
        id,
        name,
        email,
        password_hash,
        role
      )
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = ?,
        password_hash = ?,
        role = ?
    `,
    [
      randomUUID(),
      data.name,
      data.email,
      data.passwordHash,
      data.role,

      data.name,
      data.passwordHash,
      data.role,
    ],
  );

  return findUserIdByEmail(connection, data.email);
}

async function upsertDoctorProfile(
  connection: PoolConnection,
  userId: string,
  specialtyId: string,
): Promise<void> {
  await connection.execute(
    `
      INSERT INTO doctor_profiles (
        id,
        user_id,
        specialty_id
      )
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        specialty_id = ?
    `,
    [randomUUID(), userId, specialtyId, specialtyId],
  );
}

async function seed(): Promise<void> {
  const passwordHash = await bcrypt.hash("password123", 12);

  await withTransaction(mysqlPool, async (connection) => {
    const cardiologyId = await upsertSpecialty(connection, "Cardiology");

    const dermatologyId = await upsertSpecialty(connection, "Dermatology");

    await upsertSpecialty(connection, "General Practice");

    await upsertUser(connection, {
      name: "Pat Patient",
      email: "patient@example.com",
      passwordHash,
      role: "PATIENT",
    });

    const firstDoctorId = await upsertUser(connection, {
      name: "Dara Doctor",
      email: "doctor@example.com",
      passwordHash,
      role: "DOCTOR",
    });

    const secondDoctorId = await upsertUser(connection, {
      name: "Demi Doctor",
      email: "doctor2@example.com",
      passwordHash,
      role: "DOCTOR",
    });

    await upsertDoctorProfile(connection, firstDoctorId, cardiologyId);

    await upsertDoctorProfile(connection, secondDoctorId, dermatologyId);
  });

  console.info("MySQL seed completed");
  console.info("Patient: patient@example.com / password123");
  console.info("Doctor: doctor@example.com / password123");
  console.info("Doctor: doctor2@example.com / password123");
}

seed()
  .catch((error: unknown) => {
    console.error("MySQL seed failed", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMySqlConnection();
  });
