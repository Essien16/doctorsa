import type { NextFunction, Request, Response } from "express";

import type { GetCurrentUserService } from "../application/get-current-user.service.js";
import type { LoginService } from "../application/login.service.js";
import { loginRequestSchema } from "./auth.schemas.js";
import {
  destroySession,
  regenerateSession,
  saveSession,
} from "./session-operations.js";

export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly getCurrentUserService: GetCurrentUserService,
  ) {}

  login = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = loginRequestSchema.safeParse(request.body);

      if (!validation.success) {
        response.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "The login details are invalid",
            details: validation.error.flatten().fieldErrors,
          },
        });

        return;
      }

      const user = await this.loginService.execute(validation.data);

      await regenerateSession(request);

      request.session.userId = user.id;
      request.session.role = user.role;

      await saveSession(request);

      response.status(200).json({
        user,
      });
    } catch (error) {
      next(error);
    }
  };

  currentUser = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.session.userId) {
        response.status(401).json({
          error: {
            code: "AUTHENTICATION_ERROR",
            message: "Authentication required",
          },
        });

        return;
      }

      const user = await this.getCurrentUserService.execute(
        request.session.userId,
      );

      response.status(200).json({
        user,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await destroySession(request);

      response.clearCookie("doctorsa.sid");
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
