import { z } from "zod";
import { LOCATION, TEXT_LIMITS } from "@dizkarte/config";

/**
 * Shared schema primitives used across input schemas. All user-controlled input
 * is validated here before it reaches any service or the database.
 */

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Password baseline safeguard (not the final policy). Minimum length with a
 * bounded maximum to avoid resource-exhaustion inputs.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be at most 128 characters.");

/** Philippine mobile number, permissive normalization to E.164-ish +63 form. */
export const phMobileSchema = z
  .string()
  .trim()
  .regex(/^(?:\+?63|0)9\d{9}$/, "Enter a valid Philippine mobile number.")
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    const local = digits.startsWith("63") ? digits.slice(2) : digits.replace(/^0/, "");
    return `+63${local}`;
  });

/** PSGC-style locality codes (city/barangay). Source/version pending approval. */
export const localityCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "Invalid locality code.");

export const languageSchema = z.enum(["en", "fil"]);

export const landmarkSchema = z.string().trim().max(200);

export const reasonSchema = z.string().trim().min(1).max(TEXT_LIMITS.reasonMax);

/** Approximate coordinate, rounded to the configured safe precision. */
export const approximateLatSchema = z
  .number()
  .finite()
  .min(-90)
  .max(90)
  .transform((v) => roundTo(v, LOCATION.approximateDecimalPlaces));

export const approximateLngSchema = z
  .number()
  .finite()
  .min(-180)
  .max(180)
  .transform((v) => roundTo(v, LOCATION.approximateDecimalPlaces));

/** Exact coordinate (private; never exposed in public projections). */
export const exactLatSchema = z.number().finite().min(-90).max(90);
export const exactLngSchema = z.number().finite().min(-180).max(180);

export const isoDateTimeSchema = z.string().datetime({ offset: true });

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Bounded pagination input shared by feeds and Admin lists. */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
