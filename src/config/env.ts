import "dotenv/config";

import { z } from "zod";

function isValidMySqlUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "mysql:" &&
      url.hostname.length > 0 &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  MYSQL_DATABASE_URL: z
    .string()
    .min(1, "MYSQL_DATABASE_URL is required")
    .refine(isValidMySqlUrl, {
      message:
        "MYSQL_DATABASE_URL must be a valid MySQL URL containing a host and database name",
    }),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must contain at least 32 characters"),

  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  WEBHOOK_SECRET: z
    .string()
    .min(32, "WEBHOOK_SECRET must contain at least 32 characters"),

  APP_BASE_URL: z
    .string()
    .url("APP_BASE_URL must be a valid URL")
    .default("http://127.0.0.1:3000"),
});

export const env = environmentSchema.parse(process.env);
