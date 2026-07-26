import { z } from "zod";
import { MEDIA_LIMITS, TEXT_LIMITS } from "@dizkarte/config";
import { reasonSchema } from "./common.js";
import { idempotencyKeySchema, idSchema } from "../ids.js";

/** Booking command, messaging, reviews, and dispute input schemas. */

export const selectOfferSchema = z.object({
  taskId: idSchema<"TaskId">(),
  offerId: idSchema<"OfferId">(),
  idempotencyKey: idempotencyKeySchema,
});
export type SelectOfferInput = z.infer<typeof selectOfferSchema>;

export const createPaymentSessionSchema = z.object({
  bookingId: idSchema<"BookingId">(),
  idempotencyKey: idempotencyKeySchema,
});
export type CreatePaymentSessionInput = z.infer<typeof createPaymentSessionSchema>;

export const bookingCommandSchema = z.object({
  bookingId: idSchema<"BookingId">(),
  idempotencyKey: idempotencyKeySchema,
});
export type BookingCommandInput = z.infer<typeof bookingCommandSchema>;

export const requestCompletionSchema = bookingCommandSchema.extend({
  proofStoragePaths: z.array(z.string().trim().min(1).max(512)).max(10).default([]),
  note: z.string().trim().max(TEXT_LIMITS.messageBodyMax).optional(),
});
export type RequestCompletionInput = z.infer<typeof requestCompletionSchema>;

export const openDisputeSchema = bookingCommandSchema.extend({
  reason: reasonSchema,
  evidenceStoragePaths: z.array(z.string().trim().min(1).max(512)).max(10).default([]),
});
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;

// --- Messaging ---

export const sendMessageSchema = z
  .object({
    conversationId: idSchema<"ConversationId">(),
    body: z.string().trim().max(TEXT_LIMITS.messageBodyMax).optional(),
    media: z
      .array(
        z.object({
          storagePath: z.string().trim().min(1).max(512),
          kind: z.enum(["image", "video"]),
          mimeType: z.enum([
            ...MEDIA_LIMITS.allowedImageMimeTypes,
            ...MEDIA_LIMITS.allowedVideoMimeTypes,
          ]),
          sizeBytes: z.number().int().min(1).max(MEDIA_LIMITS.maxVideoBytes),
        }),
      )
      .max(5)
      .default([]),
  })
  .refine((v) => (v.body?.trim().length ?? 0) > 0 || v.media.length > 0, {
    message: "A message must include text or at least one media item.",
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// --- Reviews ---

export const reviewDimensionSchema = z.object({
  dimension: z.enum(["communication", "quality", "timeliness", "professionalism"]),
  score: z.number().int().min(1).max(5),
});

export const submitReviewSchema = z.object({
  bookingId: idSchema<"BookingId">(),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(TEXT_LIMITS.reviewCommentMax).optional(),
  dimensions: z.array(reviewDimensionSchema).max(4).default([]),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
