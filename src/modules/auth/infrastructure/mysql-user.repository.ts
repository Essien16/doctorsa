import type { Pool, RowDataPacket } from "mysql2/promise";

import type { UserRole } from "../../../shared/domain/user-role.js";
import type { AuthUser, PublicAuthUser } from "../domain/auth-user.js";
import type { UserRepository } from "../domain/user.repository.js";

interface AuthUserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
}

interface PublicAuthUserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: string;
}

function parseUserRole(role: string): UserRole {
  if (role === "PATIENT" || role === "DOCTOR") {
    return role;
  }

  throw new Error(`Unsupported user role returned by MySQL: ${role}`);
}

export class MySqlUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    const [rows] = await this.pool.execute<AuthUserRow[]>(
      `
          SELECT
            id,
            name,
            email,
            password_hash AS passwordHash,
            role
          FROM users
          WHERE email = ?
          LIMIT 1
        `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: parseUserRole(user.role),
    };
  }

  async findPublicById(id: string): Promise<PublicAuthUser | null> {
    const [rows] = await this.pool.execute<PublicAuthUserRow[]>(
      `
          SELECT
            id,
            name,
            email,
            role
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
      [id],
    );

    const user = rows[0];

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: parseUserRole(user.role),
    };
  }
}
