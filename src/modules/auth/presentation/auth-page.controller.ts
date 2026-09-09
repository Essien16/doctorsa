import type { NextFunction, Request, Response } from "express";

import { AuthenticationError } from "../../../shared/errors/authentication-error.js";
import type { LoginService } from "../application/login.service.js";
import { loginRequestSchema } from "./auth.schemas.js";
import {
  regenerateSession,
  saveSession,
  destroySession,
} from "./session-operations.js";

export class AuthPageController {
  constructor(private readonly loginService: LoginService) {}

  showLoginPage = (request: Request, response: Response): void => {
    if (request.session.userId) {
      this.redirectToDashboard(request, response);
      return;
    }

    response.status(200).render("auth/login", {
      title: "Sign in",
    });
  };

  login = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = loginRequestSchema.safeParse(request.body);

      if (!validation.success) {
        response.status(400).render("auth/login", {
          title: "Sign in",
          errorMessage: "Enter a valid email address and password.",
          email:
            typeof request.body.email === "string" ? request.body.email : "",
        });

        return;
      }

      const user = await this.loginService.execute(validation.data);

      await regenerateSession(request);

      request.session.userId = user.id;
      request.session.role = user.role;

      await saveSession(request);

      this.redirectToDashboard(request, response);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        response.status(401).render("auth/login", {
          title: "Sign in",
          errorMessage: "Invalid email or password.",
          email:
            typeof request.body.email === "string" ? request.body.email : "",
        });

        return;
      }

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

      response.clearCookie("doctorsa.sid", {
        path: "/",
      });

      response.redirect(303, "/login");
    } catch (error) {
      next(error);
    }
  };

  private redirectToDashboard(request: Request, response: Response): void {
    const destination =
      request.session.role === "DOCTOR"
        ? "/doctor/requests"
        : "/patient/visits";

    response.redirect(303, destination);
  }
}
