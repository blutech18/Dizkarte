/**
 * Raw brand palette scales sampled from the supplied Dizkarte logo assets.
 *
 * These are the derived interaction/surface steps documented in
 * `docs/Dizkarte-Brand-Color-System.md`. Application components MUST consume
 * the semantic tokens in `./tokens.ts` rather than these raw steps, except when
 * rendering an explicit brand illustration.
 *
 * The source logo PNGs are never recolored at runtime.
 */

export const purpleScale = {
  50: "#F7F2FF",
  100: "#EDE3FF",
  200: "#DCC7FF",
  300: "#C39CFF",
  400: "#9D63F4",
  500: "#6E20DF",
  600: "#5B18C2",
  700: "#42209D",
  800: "#321773",
  900: "#220F4F",
  950: "#15072F",
} as const;

export const yellowScale = {
  50: "#FFF9E6",
  100: "#FFF1B8",
  200: "#FFE47A",
  300: "#FFD64A",
  400: "#FECE32",
  500: "#FDBE17",
  600: "#D99A00",
  700: "#A96F00",
  800: "#794B00",
  900: "#4D2D00",
} as const;

export const neutralScale = {
  0: "#FFFFFF",
  50: "#F6F7FA",
  100: "#ECEEF3",
  200: "#D9DEE7",
  300: "#B7C0CE",
  400: "#8793A7",
  500: "#596274",
  600: "#3D4658",
  700: "#242D40",
  800: "#111929",
  900: "#030815",
  950: "#01030A",
} as const;

/** Canonical anchor colors sampled directly from the logo assets. */
export const brandSource = {
  iconPurple: "#6E20DF",
  wordmarkViolet: "#42209D",
  iconYellow: "#FECE32",
  wordmarkAmber: "#FDBE17",
  wordmarkNavy: "#030815",
  logoWhite: "#FFFFFF",
} as const;

export type PurpleScale = typeof purpleScale;
export type YellowScale = typeof yellowScale;
export type NeutralScale = typeof neutralScale;
