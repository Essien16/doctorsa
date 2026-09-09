import { AppError } from "./app-error.js";

export class AuthorizationError extends AppError {
  constructor(message = "You are not allowed to perform this action") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}
