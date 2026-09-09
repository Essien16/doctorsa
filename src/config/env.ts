import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must contain at least 32 characters"),

  WEBHOOK_SECRET: z
  .string()
  .min(32, "WEBHOOK_SECRET must contain at least 32 characters"),

  APP_BASE_URL: z
  .string()
  .url("APP_BASE_URL must be a valid URL")
  .default("http://127.0.0.1:3000"),
});

export const env = environmentSchema.parse(process.env);