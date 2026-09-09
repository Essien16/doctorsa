import { z } from "zod";

export const createVisitRequestSchema = z.object({
  specialtyId: z.string().uuid("Specialty ID must be a valid UUID"),

  location: z
    .string()
    .trim()
    .min(2, "Location must contain at least 2 characters")
    .max(255, "Location cannot exceed 255 characters"),

  preferredAt: z
    .string()
    .datetime({
      offset: true,
      message: "Preferred time must be an ISO date with a timezone",
    })
    .transform((value) => new Date(value)),
});

export const visitIdParamsSchema = z.object({
  visitId: z.string().uuid("Visit ID must be a valid UUID"),
});

export const submitBidRequestSchema = z.object({
  amountInKobo: z
    .number()
    .int("Bid amount must be an integer")
    .positive("Bid amount must be positive")
    .max(2_147_483_647, "Bid amount exceeds the supported limit"),

  note: z
    .string()
    .trim()
    .min(2, "Bid note must contain at least 2 characters")
    .max(280, "Bid note cannot exceed 280 characters"),
});

export const createVisitPageSchema = z.object({
  specialtyId: z.string().uuid("Select a valid specialty"),
  location: z
    .string()
    .trim()
    .min(3, "Location is required")
    .max(255, "Location is too long"),
  preferredAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "Select a valid preferred date and time",
    ),
});

export const submitBidPageSchema = z.object({
  amountInNaira: z.coerce
    .number()
    .positive("Bid amount must be greater than zero")
    .multipleOf(0.01, "Bid amount cannot have more than two decimal places"),
  note: z
    .string()
    .trim()
    .min(3, "Enter a short note")
    .max(280, "The note cannot exceed 280 characters"),
});

export type CreateVisitPageInput = z.infer<typeof createVisitPageSchema>;
