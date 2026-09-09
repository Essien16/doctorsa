import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { LoginService } from "../../src/modules/auth/application/login.service.js";
import type { PasswordHasher } from "../../src/modules/auth/domain/password-hasher.js";
import type { UserRepository } from "../../src/modules/auth/domain/user.repository.js";
import { AuthenticationError } from "../../src/shared/errors/authentication-error.js";

describe("LoginService", () => {
  const storedUser = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Pat Patient",
    email: "patient@example.com",
    passwordHash: "$2b$12$stored-password-hash",
    role: "PATIENT" as const,
  };

  const findByEmail = jest.fn<UserRepository["findByEmail"]>();

  const compare = jest.fn<PasswordHasher["compare"]>();

  const userRepository = {
    findByEmail,
  } as unknown as UserRepository;

  const passwordHasher = {
    compare,
  } as unknown as PasswordHasher;

  const service = new LoginService(userRepository, passwordHasher);

  beforeEach(() => {
    findByEmail.mockReset();
    compare.mockReset();
  });

  it("returns the public user for valid credentials", async () => {
    findByEmail.mockResolvedValue(storedUser);
    compare.mockResolvedValue(true);

    const result = await service.execute({
      email: "patient@example.com",
      password: "password123",
    });

    expect(result).toEqual({
      id: storedUser.id,
      name: storedUser.name,
      email: storedUser.email,
      role: storedUser.role,
    });

    expect(result).not.toHaveProperty("passwordHash");
  });

  it("normalizes the email before searching", async () => {
    findByEmail.mockResolvedValue(storedUser);
    compare.mockResolvedValue(true);

    await service.execute({
      email: "  PATIENT@EXAMPLE.COM  ",
      password: "password123",
    });

    expect(findByEmail).toHaveBeenCalledWith("patient@example.com");
  });

  it("compares the submitted password with the stored hash", async () => {
    findByEmail.mockResolvedValue(storedUser);
    compare.mockResolvedValue(true);

    await service.execute({
      email: storedUser.email,
      password: "password123",
    });

    expect(compare).toHaveBeenCalledTimes(1);

    expect(compare).toHaveBeenCalledWith(
      "password123",
      storedUser.passwordHash,
    );
  });

  it("does not trim or modify the submitted password", async () => {
    findByEmail.mockResolvedValue(storedUser);
    compare.mockResolvedValue(true);

    await service.execute({
      email: storedUser.email,
      password: " password123 ",
    });

    expect(compare).toHaveBeenCalledWith(
      " password123 ",
      storedUser.passwordHash,
    );
  });

  it("throws AuthenticationError when the user does not exist", async () => {
    findByEmail.mockResolvedValue(null);

    await expect(
      service.execute({
        email: "missing@example.com",
        password: "password123",
      }),
    ).rejects.toThrow(AuthenticationError);

    expect(compare).not.toHaveBeenCalled();
  });

  it("throws AuthenticationError when the password is incorrect", async () => {
    findByEmail.mockResolvedValue(storedUser);
    compare.mockResolvedValue(false);

    await expect(
      service.execute({
        email: storedUser.email,
        password: "wrong-password",
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it("uses the same error message for unknown email and incorrect password", async () => {
    findByEmail.mockResolvedValueOnce(null);

    const missingUserError = service.execute({
      email: "missing@example.com",
      password: "password123",
    });

    await expect(missingUserError).rejects.toThrow("Invalid email or password");

    findByEmail.mockResolvedValueOnce(storedUser);
    compare.mockResolvedValueOnce(false);

    const wrongPasswordError = service.execute({
      email: storedUser.email,
      password: "wrong-password",
    });

    await expect(wrongPasswordError).rejects.toThrow(
      "Invalid email or password",
    );
  });
});
