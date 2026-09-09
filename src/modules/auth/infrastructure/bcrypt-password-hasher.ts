import bcrypt from "bcryptjs";

import type { PasswordHasher } from "../domain/password-hasher.js";

export class BcryptPasswordHasher implements PasswordHasher {
  compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
