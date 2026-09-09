import { AppError } from "./app-error.js";

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} was not found`, 404, "NOT_FOUND");
  }
}