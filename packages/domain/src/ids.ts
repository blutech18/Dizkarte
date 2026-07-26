import { z } from "zod";

/**
 * Branded identifier types.
 *
 * Every entity uses a UUID string primary key. Branding prevents accidentally
 * passing, for example, a `TaskId` where a `BookingId` is required, even though
 * both are strings at runtime.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export type UserId = Brand<string, "UserId">;
export type ProfileId = UserId;
export type VerificationCaseId = Brand<string, "VerificationCaseId">;
export type VerificationDocumentId = Brand<string, "VerificationDocumentId">;
export type DeviceId = Brand<string, "DeviceId">;
export type TaskerApplicationId = Brand<string, "TaskerApplicationId">;
export type ServiceAreaId = Brand<string, "ServiceAreaId">;
export type PortfolioItemId = Brand<string, "PortfolioItemId">;
export type PayoutMethodId = Brand<string, "PayoutMethodId">;
export type SpecialtyId = Brand<string, "SpecialtyId">;
export type CategoryId = Brand<string, "CategoryId">;
export type TaskId = Brand<string, "TaskId">;
export type TaskMediaId = Brand<string, "TaskMediaId">;
export type TaskQuestionId = Brand<string, "TaskQuestionId">;
export type OfferId = Brand<string, "OfferId">;
export type BookingId = Brand<string, "BookingId">;
export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type NotificationId = Brand<string, "NotificationId">;
export type PaymentIntentId = Brand<string, "PaymentIntentId">;
export type ProviderEventId = Brand<string, "ProviderEventId">;
export type LedgerAccountId = Brand<string, "LedgerAccountId">;
export type LedgerTransactionId = Brand<string, "LedgerTransactionId">;
export type LedgerEntryId = Brand<string, "LedgerEntryId">;
export type RefundId = Brand<string, "RefundId">;
export type WithdrawalId = Brand<string, "WithdrawalId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ReportId = Brand<string, "ReportId">;
export type DisputeId = Brand<string, "DisputeId">;
export type SupportTicketId = Brand<string, "SupportTicketId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

/**
 * Assert-and-brand a UUID string. Throws if the value is not a valid UUID.
 * Use at trust boundaries where the value should already be validated.
 */
export function asId<B extends string>(value: string): Brand<string, B> {
  if (!isUuid(value)) {
    throw new TypeError(`Invalid UUID identifier: ${JSON.stringify(value)}`);
  }
  return value as Brand<string, B>;
}

/** Zod schema producing a branded id of the given brand. */
export function idSchema<B extends string>(): z.ZodType<Brand<string, B>> {
  return z.string().uuid() as unknown as z.ZodType<Brand<string, B>>;
}

/** Idempotency keys are client-generated opaque tokens (uuid or ULID-like). */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains unsupported characters")
  .transform((value) => value as IdempotencyKey);
