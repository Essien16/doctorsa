import type {
  AuthUser,
  PublicAuthUser,
} from "./auth-user.js";

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;

  findPublicById(id: string): Promise<PublicAuthUser | null>;
}