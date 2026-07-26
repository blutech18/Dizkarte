import { z } from "zod";
import { MEDIA_LIMITS, TEXT_LIMITS } from "@dizkarte/config";
import { localityCodeSchema, reasonSchema } from "./common.js";
import { idempotencyKeySchema, idSchema } from "../ids.js";
import type { VerificationCaseId } from "../ids.js";

/** Identity verification and Tasker onboarding input schemas. */

export const verificationDocumentKindSchema = z.enum([
  "government_id_front",
  "government_id_back",
  "selfie",
]);

export const verificationDocumentSchema = z.object({
  kind: verificationDocumentKindSchema,
  storagePath: z.string().trim().min(1).max(512),
  mimeType: z.enum(MEDIA_LIMITS.allowedDocumentMimeTypes),
  sizeBytes: z.number().int().min(1).max(MEDIA_LIMITS.maxImageBytes),
});

export const submitVerificationSchema = z.object({
  documents: z.array(verificationDocumentSchema).min(2).max(4),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

export const decideVerificationSchema = z.object({
  caseId: idSchema<"VerificationCaseId">(),
  decision: z.enum(["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"]),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type DecideVerificationInput = z.infer<typeof decideVerificationSchema> & {
  caseId: VerificationCaseId;
};

// --- Tasker application ---

export const serviceAreaSchema = z.object({
  cityCode: localityCodeSchema,
  barangayCode: localityCodeSchema.optional(),
  radiusKm: z.number().int().min(1).max(100).optional(),
});

export const portfolioItemSchema = z.object({
  storagePath: z.string().trim().min(1).max(512),
  caption: z.string().trim().max(280).optional(),
});

export const submitTaskerApplicationSchema = z.object({
  bio: z.string().trim().min(20).max(TEXT_LIMITS.bioMax),
  experience: z.string().trim().min(1).max(TEXT_LIMITS.bioMax),
  specialtyIds: z.array(idSchema<"SpecialtyId">()).min(1).max(10),
  serviceAreas: z.array(serviceAreaSchema).min(1).max(20),
  portfolio: z.array(portfolioItemSchema).max(MEDIA_LIMITS.maxPortfolioItems).default([]),
  // Payout token boundary: only a reference token, never raw wallet/card data.
  payoutMethodReference: z.string().trim().min(1).max(256).optional(),
  payoutProvider: z.string().trim().min(1).max(64).optional(),
});
export type SubmitTaskerApplicationInput = z.infer<typeof submitTaskerApplicationSchema>;

export const decideTaskerApplicationSchema = z.object({
  applicationId: idSchema<"TaskerApplicationId">(),
  decision: z.enum(["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED", "SUSPENDED"]),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type DecideTaskerApplicationInput = z.infer<typeof decideTaskerApplicationSchema>;
