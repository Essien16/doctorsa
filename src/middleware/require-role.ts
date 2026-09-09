import type { RequestHandler } from "express";

import type { UserRole } from "../shared/domain/user-role.js";
import { AuthenticationError } from "../shared/errors/authentication-error.js";
import { AuthorizationError } from "../shared/errors/authorization-error.js";

export function requireRole(
  ...allowedRoles: readonly UserRole[]
): RequestHandler {
  return (request, _response, next) => {
    if (!request.session.userId || !request.session.role) {
      next(new AuthenticationError());
      return;
    }

    if (!allowedRoles.includes(request.session.role)) {
      next(new AuthorizationError());
      return;
    }

    next();
  };
}