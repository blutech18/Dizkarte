import { z } from "zod";
import { TEXT_LIMITS } from "@dizkarte/config";
import {
  emailSchema,
  languageSchema,
  localityCodeSchema,
  passwordSchema,
  phMobileSchema,
} from "./common.js";

/** Authentication and session input schemas. */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(1).max(512),
  password: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

/**
 * Setting a new password on a screen that asks for it twice.
 *
 * `confirm` is compared rather than validated: applying the password rules to
 * both fields would report the same length complaint twice for one mistake. The
 * mismatch is reported on `confirm`, which is the field the user should retype,
 * not on the password they have already committed to.
 */
export const passwordUpdateSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().max(128),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });
export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;

/** Common profile update (safe fields only; account status is server-controlled). */
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  mobile: phMobileSchema.optional(),
  cityCode: localityCodeSchema.optional(),
  barangayCode: localityCodeSchema.optional(),
  language: languageSchema.optional(),
  bio: z.string().trim().max(TEXT_LIMITS.bioMax).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const notificationPreferenceSchema = z.object({
  category: z.enum([
    "verification",
    "offers",
    "bookings",
    "payments",
    "messages",
    "disputes",
    "reviews",
    "system",
  ]),
  inApp: z.boolean(),
  push: z.boolean(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

export const registerDeviceSchema = z.object({
  platform: z.enum(["ios", "android"]),
  tokenReference: z.string().trim().min(8).max(512),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
