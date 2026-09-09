import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { CreateVisitService } from "../../src/modules/visits/application/create-visit.service.js";
import type { VisitRepository } from "../../src/modules/visits/domain/visit.repository.js";
import type { Visit } from "../../src/modules/visits/domain/visit.js";
import { ConflictError } from "../../src/shared/errors/conflict-error.js";
import { NotFoundError } from "../../src/shared/errors/not-found-error.js";
import { ValidationError } from "../../src/shared/errors/validation-error.js";

describe("CreateVisitService", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  const preferredAt = new Date("2026-09-10T10:00:00.000Z");

  const createdVisit: Visit = {
    id: "00000000-0000-4000-8000-000000000001",
    patientId: "00000000-0000-4000-8000-000000000002",
    specialtyId: "00000000-0000-4000-8000-000000000003",
    selectedBidId: null,
    assignedDoctorProfileId: null,
    location: "Lekki, Lagos",
    preferredAt,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  };

  const specialtyExists = jest.fn<VisitRepository["specialtyExists"]>();

  const create = jest.fn<VisitRepository["create"]>();

  const visitRepository = {
    specialtyExists,
    create,
  } as unknown as VisitRepository;

  const service = new CreateVisitService(visitRepository, () => now);

  beforeEach(() => {
    specialtyExists.mockReset();
    create.mockReset();
  });

  it("creates a visit successfully", async () => {
    specialtyExists.mockResolvedValue(true);

    create.mockResolvedValue({
      success: true,
      visit: createdVisit,
    });

    const result = await service.execute({
      patientId: createdVisit.patientId,
      specialtyId: createdVisit.specialtyId,
      location: "  Lekki, Lagos  ",
      preferredAt,
    });

    expect(result).toEqual(createdVisit);

    expect(create).toHaveBeenCalledWith({
      patientId: createdVisit.patientId,
      specialtyId: createdVisit.specialtyId,
      location: "Lekki, Lagos",
      preferredAt,
    });
  });

  it("rejects a location shorter than two characters", async () => {
    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: " ",
        preferredAt,
      }),
    ).rejects.toThrow(ValidationError);

    expect(specialtyExists).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid preferred time", async () => {
    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: "Lekki",
        preferredAt: new Date("invalid"),
      }),
    ).rejects.toThrow(ValidationError);

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a preferred time in the past", async () => {
    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: "Lekki",
        preferredAt: new Date("2026-09-09T09:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a preferred time equal to the current time", async () => {
    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: "Lekki",
        preferredAt: now,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError for an unknown specialty", async () => {
    specialtyExists.mockResolvedValue(false);

    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: "Lekki",
        preferredAt,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(create).not.toHaveBeenCalled();
  });

  it("throws ConflictError for an overlapping patient visit", async () => {
    specialtyExists.mockResolvedValue(true);

    create.mockResolvedValue({
      success: false,
      reason: "PATIENT_SCHEDULE_CONFLICT",
    });

    await expect(
      service.execute({
        patientId: createdVisit.patientId,
        specialtyId: createdVisit.specialtyId,
        location: "Lekki",
        preferredAt,
      }),
    ).rejects.toThrow(ConflictError);
  });
});
