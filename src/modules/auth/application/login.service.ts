import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type {
  PublicAuthUser,
} from "../domain/auth-user.js";
import type { PasswordHasher } from "../domain/password-hasher.js";
import type { UserRepository } from "../domain/user.repository.js";

export interface LoginInput {
  email: string;
  password: string;
}

export class LoginService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: LoginInput): Promise<PublicAuthUser> {
    const email = input.email.trim().toLowerCase();

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new AuthenticationError("Invalid email or password");
    }

    const passwordMatches = await this.passwordHasher.compare(
      input.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new AuthenticationError("Invalid email or password");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}