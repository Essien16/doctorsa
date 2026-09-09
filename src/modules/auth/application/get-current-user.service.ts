import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { PublicAuthUser } from "../domain/auth-user.js";
import type { UserRepository } from "../domain/user.repository.js";

export class GetCurrentUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string): Promise<PublicAuthUser> {
    const user = await this.userRepository.findPublicById(userId);

    if (!user) {
      throw new AuthenticationError("Session user no longer exists");
    }

    return user;
  }
}
