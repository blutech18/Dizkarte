import { lightTheme, type ThemeColors } from "@dizkarte/config";

/**
 * The mobile app ships light UI only, matching the Admin app and the product
 * decision to not expose a user-facing dark-mode switch. Components import
 * `theme` directly rather than each re-deriving colors, so there is exactly
 * one place mapping semantic tokens into the app.
 */
export const theme: ThemeColors = lightTheme;

/**
 * Spacing scale.
 *
 * Deliberately generous from `md` up: the product direction is an Airtasker-like
 * feel, which reads as roomy rather than dense. Because screens reference these
 * tokens (card padding is `lg`, section gaps are `md`/`xl`), widening the scale
 * here de-crams the whole app at once instead of screen by screen. `xs`/`sm`
 * stay tight for genuinely inline gaps like an icon beside its label.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Minimum practical mobile touch target (platform accessibility guidance). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Type scale. Body copy is 16 and secondary text 14 — the previous 15/13 read as
 * cramped on a phone, which was the core of the client's UI feedback.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 19,
  xl: 22,
  xxl: 28,
} as const;

/**
 * Line heights paired with the type scale.
 *
 * React Native does not derive line height from font size, so text packs tightly
 * by default — a big part of why dense screens felt airless. Apply the matching
 * step to any multi-line body or description text.
 */
export const lineHeight = {
  xs: 17,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 30,
  xxl: 36,
} as const;
