import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),

  password: z.string().min(1, "Password is required"),
});
