import "express-session";

import type { UserRole } from "../domain/user-role.ts";

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: UserRole;
  }
}
