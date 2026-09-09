export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);

    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}