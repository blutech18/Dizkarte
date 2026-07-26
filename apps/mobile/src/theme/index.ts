import { lightTheme, type ThemeColors } from "@dizkarte/config";

/**
 * The mobile app ships light UI only, matching the Admin app and the product
 * decision to not expose a user-facing dark-mode switch. Components import
 * `theme` directly rather than each re-deriving colors, so there is exactly
 * one place mapping semantic tokens into the app.
 */
export const theme: ThemeColors = lightTheme;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum practical mobile touch target (platform accessibility guidance). */
export const MIN_TOUCH_TARGET = 44;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
} as const;
