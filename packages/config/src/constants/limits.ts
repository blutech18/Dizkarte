/**
 * Shared non-secret technical safeguards.
 *
 * These are conservative implementation limits, NOT business policy. Values
 * such as fee rate default to zero and remain configurable pending written
 * Client approval (see requirements section 6).
 */

/** ISO 4217 currency. PHP only unless later approved. */
export const SUPPORTED_CURRENCY = "PHP" as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCY;

/** Fee rate is configurable and zero by default. The illustrative 8% is never hard-coded. */
export const DEFAULT_PLATFORM_FEE_BPS = 0 as const;

/** Pagination safeguards for feeds and Admin lists. */
export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
  minPageSize: 1,
} as const;

/** Bounded free-text limits (technical safeguards, not policy). */
export const TEXT_LIMITS = {
  taskTitleMax: 120,
  taskDescriptionMax: 4000,
  offerMessageMax: 2000,
  messageBodyMax: 4000,
  reviewCommentMax: 2000,
  questionBodyMax: 1000,
  bioMax: 2000,
  reasonMax: 1000,
} as const;

/** Upload safeguards. Final media policy pending Client approval. */
export const MEDIA_LIMITS = {
  maxTaskMediaCount: 10,
  maxPortfolioItems: 20,
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
  allowedImageMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  allowedVideoMimeTypes: ["video/mp4", "video/quicktime"] as const,
  allowedDocumentMimeTypes: ["image/jpeg", "image/png", "application/pdf"] as const,
} as const;

/** Money bounds in integer centavos. */
export const MONEY_LIMITS = {
  /** Smallest allowable positive task budget: PHP 20.00. */
  minTaskBudgetCentavos: 2000,
  /** Upper safeguard: PHP 1,000,000.00. */
  maxAmountCentavos: 100_000_000,
} as const;

/** Public location precision safeguard (approximate pin), pending approval. */
export const LOCATION = {
  approximateDecimalPlaces: 3,
  maxServiceRadiusKm: 100,
} as const;

/** Signed-URL lifetime safeguard for private storage access (seconds). */
export const SIGNED_URL_TTL_SECONDS = 300 as const;
