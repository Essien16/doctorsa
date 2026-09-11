import { randomUUID } from "node:crypto";

import type { Pool, RowDataPacket } from "mysql2/promise";

import { withTransaction } from "../../../infrastructure/database/transaction.js";
import type { AssignedVisit } from "../domain/assigned-visit.js";
import type { Bid } from "../domain/bid.js";
import type { DoctorProfile } from "../domain/doctor-profile.js";
import type { OpenVisit } from "../domain/open-visit.js";
import type { PatientVisitDetails } from "../domain/patient-visit-details.js";
import type { PatientVisitSummary } from "../domain/patient-visit-summary.js";
import type { Specialty } from "../domain/specialty.js";
import type {
  CreateVisitData,
  CreateVisitResult,
  SubmitBidData,
  SubmitBidResult,
  VisitRepository,
} from "../domain/visit.repository.js";
import type { VisitStatus } from "../domain/visit-status.js";

interface IdRow extends RowDataPacket {
  id: string;
}

interface SpecialtyRow extends RowDataPacket {
  id: string;
  name: string;
}

interface DoctorProfileRow extends RowDataPacket {
  id: string;
  userId: string;
  specialtyId: string;
}

interface VisitRow extends RowDataPacket {
  id: string;
  patientId: string;
  specialtyId: string;
  selectedBidId: string | null;
  assignedDoctorProfileId: string | null;
  location: string;
  preferredAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OpenVisitRow extends RowDataPacket {
  id: string;
  patientName: string;
  specialtyId: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: string;
  createdAt: Date;
}

interface LockedVisitRow extends RowDataPacket {
  id: string;
  specialtyId: string;
  status: string;
  selectedBidId: string | null;
}

interface BidRow extends RowDataPacket {
  id: string;
  visitId: string;
  doctorProfileId: string;
  amountInKobo: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PatientVisitRow extends RowDataPacket {
  id: string;
  patientId: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: string;
  selectedBidId: string | null;
  assignedDoctorName: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  createdAt: Date;
}

interface PatientBidRow extends RowDataPacket {
  id: string;
  doctorName: string;
  amountInKobo: number;
  note: string;
  createdAt: Date;
}

interface AssignedVisitRow extends RowDataPacket {
  id: string;
  patientName: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  amountInKobo: number | null;
  bidNote: string | null;
  assignedAt: Date;
}

interface PatientVisitSummaryRow extends RowDataPacket {
  id: string;
  specialtyName: string;
  location: string;
  preferredAt: Date;
  status: string;
  createdAt: Date;
}

type PatientPaymentStatus = NonNullable<
  PatientVisitDetails["payment"]
>["status"];

function parseVisitStatus(status: string): VisitStatus {
  if (
    status === "OPEN" ||
    status === "BIDDING" ||
    status === "PAID" ||
    status === "ASSIGNED"
  ) {
    return status;
  }

  throw new Error(`Unsupported visit status returned by MySQL: ${status}`);
}

function parsePaymentStatus(status: string): PatientPaymentStatus {
  if (status === "PENDING" || status === "SUCCEEDED" || status === "FAILED") {
    return status;
  }

  throw new Error(`Unsupported payment status returned by MySQL: ${status}`);
}

function mapBid(row: BidRow): Bid {
  return {
    id: row.id,
    visitId: row.visitId,
    doctorProfileId: row.doctorProfileId,
    amountInKobo: row.amountInKobo,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class MySqlVisitRepository implements VisitRepository {
  constructor(private readonly pool: Pool) {}

  async specialtyExists(specialtyId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<IdRow[]>(
      `
        SELECT id
        FROM specialties
        WHERE id = ?
        LIMIT 1
      `,
      [specialtyId],
    );

    return rows.length > 0;
  }

  async listSpecialties(): Promise<Specialty[]> {
    const [rows] = await this.pool.execute<SpecialtyRow[]>(
      `
          SELECT
            id,
            name
          FROM specialties
          ORDER BY name ASC
        `,
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
    }));
  }

  async findDoctorProfileByUserId(
    userId: string,
  ): Promise<DoctorProfile | null> {
    const [rows] = await this.pool.execute<DoctorProfileRow[]>(
      `
          SELECT
            id,
            user_id AS userId,
            specialty_id AS specialtyId
          FROM doctor_profiles
          WHERE user_id = ?
          LIMIT 1
        `,
      [userId],
    );

    const profile = rows[0];

    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      userId: profile.userId,
      specialtyId: profile.specialtyId,
    };
  }

  async listOpenForSpecialty(specialtyId: string): Promise<OpenVisit[]> {
    const [rows] = await this.pool.execute<OpenVisitRow[]>(
      `
          SELECT
            v.id,
            patient.name AS patientName,
            v.specialty_id AS specialtyId,
            specialty.name AS specialtyName,
            v.location,
            v.preferred_at AS preferredAt,
            v.status,
            v.created_at AS createdAt
          FROM visits AS v
          INNER JOIN users AS patient
            ON patient.id = v.patient_id
          INNER JOIN specialties AS specialty
            ON specialty.id = v.specialty_id
          WHERE v.specialty_id = ?
            AND v.status IN ('OPEN', 'BIDDING')
          ORDER BY v.created_at DESC
        `,
      [specialtyId],
    );

    return rows.map((row) => {
      const status = parseVisitStatus(row.status);

      if (status !== "OPEN" && status !== "BIDDING") {
        throw new Error(`Unexpected open visit status: ${status}`);
      }

      return {
        id: row.id,
        patientName: row.patientName,
        specialtyId: row.specialtyId,
        specialtyName: row.specialtyName,
        location: row.location,
        preferredAt: row.preferredAt,
        status,
        createdAt: row.createdAt,
      };
    });
  }

  async create(data: CreateVisitData): Promise<CreateVisitResult> {
    const scheduledEndAt = new Date(
      data.preferredAt.getTime() + 60 * 60 * 1_000,
    );

    return withTransaction(this.pool, async (connection) => {
    
      const [patients] = await connection.execute<IdRow[]>(
        `
              SELECT id
              FROM users
              WHERE id = ?
              FOR UPDATE
            `,
        [data.patientId],
      );

      if (patients.length === 0) {
        throw new Error(`Patient ${data.patientId} was not found`);
      }

      const [overlappingVisits] = await connection.execute<IdRow[]>(
        `
              SELECT id
              FROM visits
              WHERE patient_id = ?
                AND preferred_at < ?
                AND scheduled_end_at > ?
              LIMIT 1
            `,
        [data.patientId, scheduledEndAt, data.preferredAt],
      );

      if (overlappingVisits.length > 0) {
        return {
          success: false,
          reason: "PATIENT_SCHEDULE_CONFLICT",
        };
      }

      const visitId = randomUUID();

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
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
          `,
        [
          visitId,
          data.patientId,
          data.specialtyId,
          data.location,
          data.preferredAt,
          scheduledEndAt,
        ],
      );

      await connection.execute(
        `
            INSERT INTO visit_status_history (
              id,
              visit_id,
              from_status,
              to_status
            )
            VALUES (?, ?, NULL, 'OPEN')
          `,
        [randomUUID(), visitId],
      );

      const [visits] = await connection.execute<VisitRow[]>(
        `
              SELECT
                id,
                patient_id AS patientId,
                specialty_id AS specialtyId,
                selected_bid_id AS selectedBidId,
                assigned_doctor_profile_id
                  AS assignedDoctorProfileId,
                location,
                preferred_at AS preferredAt,
                status,
                created_at AS createdAt,
                updated_at AS updatedAt
              FROM visits
              WHERE id = ?
              LIMIT 1
            `,
        [visitId],
      );

      const visit = visits[0];

      if (!visit) {
        throw new Error("Created visit could not be retrieved");
      }

      return {
        success: true,
        visit: {
          id: visit.id,
          patientId: visit.patientId,
          specialtyId: visit.specialtyId,
          selectedBidId: visit.selectedBidId,
          assignedDoctorProfileId: visit.assignedDoctorProfileId,
          location: visit.location,
          preferredAt: visit.preferredAt,
          status: parseVisitStatus(visit.status),
          createdAt: visit.createdAt,
          updatedAt: visit.updatedAt,
        },
      };
    });
  }

  async submitBid(data: SubmitBidData): Promise<SubmitBidResult> {
    return withTransaction(this.pool, async (connection) => {
      const [visits] = await connection.execute<LockedVisitRow[]>(
        `
              SELECT
                id,
                specialty_id AS specialtyId,
                status,
                selected_bid_id AS selectedBidId
              FROM visits
              WHERE id = ?
              FOR UPDATE
            `,
        [data.visitId],
      );

      const visit = visits[0];

      if (!visit) {
        return {
          success: false,
          reason: "VISIT_NOT_FOUND",
        };
      }

      const [doctorProfiles] = await connection.execute<DoctorProfileRow[]>(
        `
              SELECT
                id,
                user_id AS userId,
                specialty_id AS specialtyId
              FROM doctor_profiles
              WHERE user_id = ?
              LIMIT 1
            `,
        [data.doctorUserId],
      );

      const doctorProfile = doctorProfiles[0];

      if (!doctorProfile) {
        return {
          success: false,
          reason: "DOCTOR_PROFILE_NOT_FOUND",
        };
      }

      if (visit.specialtyId !== doctorProfile.specialtyId) {
        return {
          success: false,
          reason: "SPECIALTY_MISMATCH",
        };
      }

      const status = parseVisitStatus(visit.status);

      if (
        (status !== "OPEN" && status !== "BIDDING") ||
        visit.selectedBidId !== null
      ) {
        return {
          success: false,
          reason: "VISIT_NOT_ACCEPTING_BIDS",
        };
      }

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
            ON DUPLICATE KEY UPDATE
                amount_in_kobo = ?,
                note = ?,
                updated_at = CURRENT_TIMESTAMP(3)
          `,
        [
          randomUUID(),
          visit.id,
          doctorProfile.id,
          data.amountInKobo,
          data.note,

          data.amountInKobo,
          data.note,
        ],
      );

      if (status === "OPEN") {
        await connection.execute(
          `
              UPDATE visits
              SET status = 'BIDDING'
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
              VALUES (?, ?, 'OPEN', 'BIDDING')
            `,
          [randomUUID(), visit.id],
        );
      }

      const [bids] = await connection.execute<BidRow[]>(
        `
              SELECT
                id,
                visit_id AS visitId,
                doctor_profile_id
                  AS doctorProfileId,
                amount_in_kobo AS amountInKobo,
                note,
                created_at AS createdAt,
                updated_at AS updatedAt
              FROM bids
              WHERE visit_id = ?
                AND doctor_profile_id = ?
              LIMIT 1
            `,
        [visit.id, doctorProfile.id],
      );

      const bid = bids[0];

      if (!bid) {
        throw new Error("Created bid could not be retrieved");
      }

      return {
        success: true,
        bid: mapBid(bid),
      };
    });
  }

  async findPatientVisitDetails(
    visitId: string,
    patientId: string,
  ): Promise<PatientVisitDetails | null> {
    const [visits] = await this.pool.execute<PatientVisitRow[]>(
      `
          SELECT
            v.id,
            v.patient_id AS patientId,
            specialty.name AS specialtyName,
            v.location,
            v.preferred_at AS preferredAt,
            v.status,
            v.selected_bid_id AS selectedBidId,
            doctor_user.name AS assignedDoctorName,
            payment.id AS paymentId,
            payment.status AS paymentStatus,
            v.created_at AS createdAt
          FROM visits AS v
          INNER JOIN specialties AS specialty
            ON specialty.id = v.specialty_id
          LEFT JOIN doctor_profiles AS assigned_doctor
            ON assigned_doctor.id =
              v.assigned_doctor_profile_id
          LEFT JOIN users AS doctor_user
            ON doctor_user.id =
              assigned_doctor.user_id
          LEFT JOIN payments AS payment
            ON payment.visit_id = v.id
          WHERE v.id = ?
            AND v.patient_id = ?
          LIMIT 1
        `,
      [visitId, patientId],
    );

    const visit = visits[0];

    if (!visit) {
      return null;
    }

    const [bids] = await this.pool.execute<PatientBidRow[]>(
      `
          SELECT
            bid.id,
            doctor_user.name AS doctorName,
            bid.amount_in_kobo AS amountInKobo,
            bid.note,
            bid.created_at AS createdAt
          FROM bids AS bid
          INNER JOIN doctor_profiles AS doctor
            ON doctor.id = bid.doctor_profile_id
          INNER JOIN users AS doctor_user
            ON doctor_user.id = doctor.user_id
          WHERE bid.visit_id = ?
          ORDER BY bid.amount_in_kobo ASC
        `,
      [visit.id],
    );

    return {
      id: visit.id,
      patientId: visit.patientId,
      specialtyName: visit.specialtyName,
      location: visit.location,
      preferredAt: visit.preferredAt,
      status: parseVisitStatus(visit.status),
      selectedBidId: visit.selectedBidId,
      assignedDoctorName: visit.assignedDoctorName,
      payment:
        visit.paymentId && visit.paymentStatus
          ? {
              id: visit.paymentId,
              status: parsePaymentStatus(visit.paymentStatus),
            }
          : null,
      bids: bids.map((bid) => ({
        id: bid.id,
        doctorName: bid.doctorName,
        amountInKobo: bid.amountInKobo,
        note: bid.note,
        createdAt: bid.createdAt,
      })),
      createdAt: visit.createdAt,
    };
  }

  async listAssignedForDoctorProfile(
    doctorProfileId: string,
  ): Promise<AssignedVisit[]> {
    const [rows] = await this.pool.execute<AssignedVisitRow[]>(
      `
          SELECT
            v.id,
            patient.name AS patientName,
            specialty.name AS specialtyName,
            v.location,
            v.preferred_at AS preferredAt,
            bid.amount_in_kobo AS amountInKobo,
            bid.note AS bidNote,
            v.updated_at AS assignedAt
          FROM visits AS v
          INNER JOIN users AS patient
            ON patient.id = v.patient_id
          INNER JOIN specialties AS specialty
            ON specialty.id = v.specialty_id
          LEFT JOIN bids AS bid
            ON bid.id = v.selected_bid_id
          WHERE v.assigned_doctor_profile_id = ?
            AND v.status = 'ASSIGNED'
          ORDER BY v.preferred_at ASC
        `,
      [doctorProfileId],
    );

    return rows.map((row) => {
      if (row.amountInKobo === null || row.bidNote === null) {
        throw new Error(`Assigned visit ${row.id} has no selected bid`);
      }

      return {
        id: row.id,
        patientName: row.patientName,
        specialtyName: row.specialtyName,
        location: row.location,
        preferredAt: row.preferredAt,
        amountInKobo: row.amountInKobo,
        bidNote: row.bidNote,
        assignedAt: row.assignedAt,
      };
    });
  }

  async listForPatient(patientId: string): Promise<PatientVisitSummary[]> {
    const [rows] = await this.pool.execute<PatientVisitSummaryRow[]>(
      `
          SELECT
            v.id,
            specialty.name AS specialtyName,
            v.location,
            v.preferred_at AS preferredAt,
            v.status,
            v.created_at AS createdAt
          FROM visits AS v
          INNER JOIN specialties AS specialty
            ON specialty.id = v.specialty_id
          WHERE v.patient_id = ?
          ORDER BY v.created_at DESC
        `,
      [patientId],
    );

    return rows.map((row) => ({
      id: row.id,
      specialtyName: row.specialtyName,
      location: row.location,
      preferredAt: row.preferredAt,
      status: parseVisitStatus(row.status),
      createdAt: row.createdAt,
    }));
  }
}
