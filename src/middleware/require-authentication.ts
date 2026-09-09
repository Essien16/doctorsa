import type { RequestHandler } from "express";

import { AuthenticationError } from "../shared/errors/authentication-error.js";

export const requireAuthentication: RequestHandler = (
  request,
  _response,
  next,
) => {
  if (!request.session.userId) {
    next(new AuthenticationError());
    return;
  }

  next();
};
