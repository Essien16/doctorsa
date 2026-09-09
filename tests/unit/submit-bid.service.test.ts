import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { SubmitBidService } from "../../src/modules/visits/application/submit-bid.service.js";
import type { Bid } from "../../src/modules/visits/domain/bid.js";
import type { VisitRepository } from "../../src/modules/visits/domain/visit.repository.js";
import { AuthorizationError } from "../../src/shared/errors/authorization-error.js";
import { ConflictError } from "../../src/shared/errors/conflict-error.js";
import { NotFoundError } from "../../src/shared/errors/not-found-error.js";
import { ValidationError } from "../../src/shared/errors/validation-error.js";

describe("SubmitBidService", () => {
  const input = {
    visitId: "00000000-0000-4000-8000-000000000001",
    doctorUserId: "00000000-0000-4000-8000-000000000002",
    amountInKobo: 1_500_000,
    note: "Available at the requested time",
  };

  const bid: Bid = {
    id: "00000000-0000-4000-8000-000000000003",
    visitId: input.visitId,
    doctorProfileId: "00000000-0000-4000-8000-000000000004",
    amountInKobo: input.amountInKobo,
    note: input.note,
    createdAt: new Date("2026-09-09T10:00:00.000Z"),
    updatedAt: new Date("2026-09-09T10:00:00.000Z"),
  };

  const submitBid = jest.fn<VisitRepository["submitBid"]>();

  const visitRepository = {
    submitBid,
  } as unknown as VisitRepository;

  const service = new SubmitBidService(visitRepository);

  beforeEach(() => {
    submitBid.mockReset();
  });

  it("submits a valid bid successfully", async () => {
    submitBid.mockResolvedValue({
      success: true,
      bid,
    });

    const result = await service.execute(input);

    expect(result).toEqual(bid);

    expect(submitBid).toHaveBeenCalledTimes(1);

    expect(submitBid).toHaveBeenCalledWith(input);
  });

  it("trims the bid note before submission", async () => {
    submitBid.mockResolvedValue({
      success: true,
      bid,
    });

    await service.execute({
      ...input,
      note: "  Available at the requested time  ",
    });

    expect(submitBid).toHaveBeenCalledWith({
      ...input,
      note: "Available at the requested time",
    });
  });

  it.each([
    0,
    -100,
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid bid amount %s", async (amountInKobo) => {
    await expect(
      service.execute({
        ...input,
        amountInKobo,
      }),
    ).rejects.toThrow(ValidationError);

    expect(submitBid).not.toHaveBeenCalled();
  });

  it("rejects a note shorter than two characters", async () => {
    await expect(
      service.execute({
        ...input,
        note: " ",
      }),
    ).rejects.toThrow(ValidationError);

    expect(submitBid).not.toHaveBeenCalled();
  });

  it("rejects a note longer than 280 characters", async () => {
    await expect(
      service.execute({
        ...input,
        note: "a".repeat(281),
      }),
    ).rejects.toThrow(ValidationError);

    expect(submitBid).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the doctor profile does not exist", async () => {
    submitBid.mockResolvedValue({
      success: false,
      reason: "DOCTOR_PROFILE_NOT_FOUND",
    });

    await expect(service.execute(input)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when the visit does not exist", async () => {
    submitBid.mockResolvedValue({
      success: false,
      reason: "VISIT_NOT_FOUND",
    });

    await expect(service.execute(input)).rejects.toThrow(NotFoundError);
  });

  it("rejects a doctor whose specialty does not match", async () => {
    submitBid.mockResolvedValue({
      success: false,
      reason: "SPECIALTY_MISMATCH",
    });

    await expect(service.execute(input)).rejects.toThrow(AuthorizationError);
  });

  it("rejects a visit that is no longer accepting bids", async () => {
    submitBid.mockResolvedValue({
      success: false,
      reason: "VISIT_NOT_ACCEPTING_BIDS",
    });

    await expect(service.execute(input)).rejects.toThrow(ConflictError);
  });
});
