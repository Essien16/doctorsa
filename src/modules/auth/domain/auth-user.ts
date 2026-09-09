import type { UserRole } from "../../../shared/domain/user-role.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export type PublicAuthUser = Omit<AuthUser, "passwordHash">;