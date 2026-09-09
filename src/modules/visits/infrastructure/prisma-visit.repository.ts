import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { Bid } from "../domain/bid.js";
import type { DoctorProfile } from "../domain/doctor-profile.js";
import type { OpenVisit } from "../domain/open-visit.js";
import type { Specialty } from "../domain/specialty.js";
import type {
  CreateVisitData,
  CreateVisitResult,
  SubmitBidData,
  SubmitBidResult,
  VisitRepository,
} from "../domain/visit.repository.js";
import type { PatientVisitDetails } from "../domain/patient-visit-details.js";
import type { AssignedVisit } from "../domain/assigned-visit.js";
import type { PatientVisitSummary } from "../domain/patient-visit-summary.js";

export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async specialtyExists(specialtyId: string): Promise<boolean> {
    const specialty = await this.prisma.specialty.findUnique({
      where: {
        id: specialtyId,
      },
      select: {
        id: true,
      },
    });

    return specialty !== null;
  }

  async create(data: CreateVisitData): Promise<CreateVisitResult> {
    const scheduledEndAt = new Date(
      data.preferredAt.getTime() + 60 * 60 * 1000,
    );

    return this.prisma.$transaction(
      async (transaction): Promise<CreateVisitResult> => {
        /*
         * Serialize scheduling operations for this patient.
         * This prevents two concurrent requests from both
         * passing the overlap check.
         */
        await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${data.patientId}::text, 0)
        )
      `;

        const overlappingVisit = await transaction.visit.findFirst({
          where: {
            patientId: data.patientId,
            preferredAt: {
              lt: scheduledEndAt,
            },
            scheduledEndAt: {
              gt: data.preferredAt,
            },
          },
          select: {
            id: true,
          },
        });

        if (overlappingVisit) {
          return {
            success: false,
            reason: "PATIENT_SCHEDULE_CONFLICT",
          };
        }

        const visit = await transaction.visit.create({
          data: {
            patientId: data.patientId,
            specialtyId: data.specialtyId,
            location: data.location,
            preferredAt: data.preferredAt,
            scheduledEndAt,
          },
        });

        await transaction.visitStatusHistory.create({
          data: {
            visitId: visit.id,
            fromStatus: null,
            toStatus: "OPEN",
          },
        });

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
            status: visit.status,
            createdAt: visit.createdAt,
            updatedAt: visit.updatedAt,
          },
        };
      },
    );
  }

  async listSpecialties(): Promise<Specialty[]> {
    return this.prisma.specialty.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  async findDoctorProfileByUserId(
    userId: string,
  ): Promise<DoctorProfile | null> {
    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        userId: true,
        specialtyId: true,
      },
    });

    if (!doctorProfile) {
      return null;
    }

    return {
      id: doctorProfile.id,
      userId: doctorProfile.userId,
      specialtyId: doctorProfile.specialtyId,
    };
  }

  async listOpenForSpecialty(specialtyId: string): Promise<OpenVisit[]> {
    const visits = await this.prisma.visit.findMany({
      where: {
        specialtyId,
        status: {
          in: ["OPEN", "BIDDING"],
        },
      },
      select: {
        id: true,
        location: true,
        preferredAt: true,
        status: true,
        createdAt: true,
        specialtyId: true,
        patient: {
          select: {
            name: true,
          },
        },
        specialty: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return visits.map((visit) => {
      if (visit.status !== "OPEN" && visit.status !== "BIDDING") {
        throw new Error(`Unexpected open visit status: ${visit.status}`);
      }

      return {
        id: visit.id,
        patientName: visit.patient.name,
        specialtyId: visit.specialtyId,
        specialtyName: visit.specialty.name,
        location: visit.location,
        preferredAt: visit.preferredAt,
        status: visit.status,
        createdAt: visit.createdAt,
      };
    });
  }

  async submitBid(data: SubmitBidData): Promise<SubmitBidResult> {
    return this.prisma.$transaction(
      async (transaction): Promise<SubmitBidResult> => {
        // Lock the visit so bid submission cannot race with bid selection or payment processing.
        const lockedVisits = await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "visits"
        WHERE "id" = ${data.visitId}::uuid
        FOR UPDATE
      `;

        if (lockedVisits.length === 0) {
          return {
            success: false,
            reason: "VISIT_NOT_FOUND",
          };
        }

        const doctorProfile = await transaction.doctorProfile.findUnique({
          where: {
            userId: data.doctorUserId,
          },
          select: {
            id: true,
            specialtyId: true,
          },
        });

        if (!doctorProfile) {
          return {
            success: false,
            reason: "DOCTOR_PROFILE_NOT_FOUND",
          };
        }

        const visit = await transaction.visit.findUnique({
          where: {
            id: data.visitId,
          },
          select: {
            id: true,
            specialtyId: true,
            status: true,
            selectedBidId: true,
          },
        });

        if (!visit) {
          return {
            success: false,
            reason: "VISIT_NOT_FOUND",
          };
        }

        if (visit.specialtyId !== doctorProfile.specialtyId) {
          return {
            success: false,
            reason: "SPECIALTY_MISMATCH",
          };
        }

        if (
          (visit.status !== "OPEN" && visit.status !== "BIDDING") ||
          visit.selectedBidId !== null
        ) {
          return {
            success: false,
            reason: "VISIT_NOT_ACCEPTING_BIDS",
          };
        }

        const bid = await transaction.bid.upsert({
          where: {
            visitId_doctorProfileId: {
              visitId: visit.id,
              doctorProfileId: doctorProfile.id,
            },
          },
          update: {
            amountInKobo: data.amountInKobo,
            note: data.note,
          },
          create: {
            visitId: visit.id,
            doctorProfileId: doctorProfile.id,
            amountInKobo: data.amountInKobo,
            note: data.note,
          },
        });

        if (visit.status === "OPEN") {
          await transaction.visit.update({
            where: {
              id: visit.id,
            },
            data: {
              status: "BIDDING",
            },
          });

          await transaction.visitStatusHistory.create({
            data: {
              visitId: visit.id,
              fromStatus: "OPEN",
              toStatus: "BIDDING",
            },
          });
        }

        const domainBid: Bid = {
          id: bid.id,
          visitId: bid.visitId,
          doctorProfileId: bid.doctorProfileId,
          amountInKobo: bid.amountInKobo,
          note: bid.note,
          createdAt: bid.createdAt,
          updatedAt: bid.updatedAt,
        };

        return {
          success: true,
          bid: domainBid,
        };
      },
    );
  }

  async findPatientVisitDetails(
    visitId: string,
    patientId: string,
  ): Promise<PatientVisitDetails | null> {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        patientId,
      },
      select: {
        id: true,
        patientId: true,
        location: true,
        preferredAt: true,
        status: true,
        selectedBidId: true,
        createdAt: true,
        specialty: {
          select: {
            name: true,
          },
        },
        assignedDoctor: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        payment: {
          select: {
            id: true,
            status: true,
          },
        },
        bids: {
          select: {
            id: true,
            amountInKobo: true,
            note: true,
            createdAt: true,
            doctorProfile: {
              select: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            amountInKobo: "asc",
          },
        },
      },
    });

    if (!visit) {
      return null;
    }

    return {
      id: visit.id,
      patientId: visit.patientId,
      specialtyName: visit.specialty.name,
      location: visit.location,
      preferredAt: visit.preferredAt,
      status: visit.status,
      selectedBidId: visit.selectedBidId,
      assignedDoctorName: visit.assignedDoctor?.user.name ?? null,
      payment: visit.payment
        ? {
            id: visit.payment.id,
            status: visit.payment.status,
          }
        : null,
      bids: visit.bids.map((bid) => ({
        id: bid.id,
        doctorName: bid.doctorProfile.user.name,
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
    const visits = await this.prisma.visit.findMany({
      where: {
        assignedDoctorProfileId: doctorProfileId,
        status: "ASSIGNED",
      },
      select: {
        id: true,
        location: true,
        preferredAt: true,
        updatedAt: true,
        patient: {
          select: {
            name: true,
          },
        },
        specialty: {
          select: {
            name: true,
          },
        },
        selectedBid: {
          select: {
            amountInKobo: true,
            note: true,
          },
        },
      },
      orderBy: {
        preferredAt: "asc",
      },
    });

    return visits.map((visit) => {
      if (!visit.selectedBid) {
        throw new Error(`Assigned visit ${visit.id} has no selected bid`);
      }

      return {
        id: visit.id,
        patientName: visit.patient.name,
        specialtyName: visit.specialty.name,
        location: visit.location,
        preferredAt: visit.preferredAt,
        amountInKobo: visit.selectedBid.amountInKobo,
        bidNote: visit.selectedBid.note,
        assignedAt: visit.updatedAt,
      };
    });
  }

  async listForPatient(patientId: string): Promise<PatientVisitSummary[]> {
    const visits = await this.prisma.visit.findMany({
      where: {
        patientId,
      },
      select: {
        id: true,
        location: true,
        preferredAt: true,
        status: true,
        createdAt: true,
        specialty: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return visits.map((visit) => ({
      id: visit.id,
      specialtyName: visit.specialty.name,
      location: visit.location,
      preferredAt: visit.preferredAt,
      status: visit.status,
      createdAt: visit.createdAt,
    }));
  }
}
