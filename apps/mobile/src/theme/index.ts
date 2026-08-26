import { useWindowDimensions, type TextStyle } from "react-native";
import { lightTheme, type ThemeColors } from "@dizkarte/config";

/**
 * The mobile app ships light UI only, matching the Admin app and the product
 * decision to not expose a user-facing dark-mode switch. Components import
 * `theme` directly rather than each re-deriving colors, so there is exactly
 * one place mapping semantic tokens into the app.
 */
export const theme: ThemeColors = lightTheme;

/**
 * Suppresses the browser's default focus outline on a text input rendered by
 * React Native Web.
 *
 * RNW renders `TextInput` as a real `<input>`/`<textarea>` DOM node, which
 * receives the browser's own focus ring — a rectangle that ignores
 * `borderRadius` entirely. Against a pill-shaped or rounded field (the
 * default look for every search bar and message composer in this app) that
 * rectangle visibly juts out past the rounded corners.
 *
 * `outlineStyle`/`outlineWidth` are RNW-only style keys with no official RN
 * type, so this is defined once, already cast, and spread into a `style`
 * array — every input applies the exact same fix instead of each screen
 * re-deriving its own inline `as any` cast (easy to omit, which is exactly
 * how this bug keeps recurring field by field).
 */
export const noWebOutline: TextStyle = {
  outlineStyle: "none",
  outlineWidth: 0,
} as unknown as TextStyle;

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

/**
 * Layout breakpoints, in logical pixels (matches `useWindowDimensions().width`).
 *
 * Phones make up the vast majority of usage, but the same screens also render
 * on tablets and some larger Android devices. `Screen` uses this to widen the
 * side gutters and cap content width there, so text lines and cards don't
 * stretch edge-to-edge on a 10" tablet the same way they do on a phone.
 */
export const breakpoints = {
  /** Older compact phones and narrow split-screen/web views. */
  narrowPhone: 350,
  /** iPhone SE/mini widths sit below this; current iPhones start at 390pt. */
  compactPhone: 390,
  tablet: 768,
} as const;

/** Content is optically centered and capped past this width on tablets. */
export const MAX_CONTENT_WIDTH = 720;

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

/**
 * Resolve responsive screen gutters and max width from a logical viewport.
 *
 * Current iPhones (390pt and wider) keep the standard `lg` gutter. Compact
 * phones get a little more usable width, while tablets retain their wider
 * gutters and `MAX_CONTENT_WIDTH` cap. Kept pure so these boundaries can be
 * unit tested independently of React Native.
 */
export function responsiveLayoutForWidth(width: number) {
  const isTablet = width >= breakpoints.tablet;
  const isNarrowPhone = width < breakpoints.narrowPhone;
  const isCompactPhone = width < breakpoints.compactPhone;
  const gutter = isTablet
    ? spacing.xxl
    : isNarrowPhone
      ? spacing.md
      : isCompactPhone
        ? spacing.md + 2
        : spacing.lg;
  const contentWidth = isTablet ? Math.min(width, MAX_CONTENT_WIDTH) : width;

  return { isTablet, isCompactPhone, isNarrowPhone, gutter, contentWidth } as const;
}

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  return responsiveLayoutForWidth(width);
}
