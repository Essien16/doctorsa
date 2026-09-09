import { z } from "zod";

export const selectBidParamsSchema = z.object({
  visitId: z
    .string()
    .uuid("Visit ID must be a valid UUID"),

  bidId: z
    .string()
    .uuid("Bid ID must be a valid UUID"),
});

export const paymentSucceededEventSchema = z.object({
  id: z.string().min(1, "Event ID is required"),

  type: z.literal("payment.succeeded"),

  data: z.object({
    paymentId: z
      .string()
      .uuid("Payment ID must be a valid UUID"),

    providerReference: z
      .string()
      .min(1, "Provider reference is required"),
  }),
});

export const paymentIdParamsSchema = z.object({
  paymentId: z
    .string()
    .uuid("Payment ID must be a valid UUID"),
});