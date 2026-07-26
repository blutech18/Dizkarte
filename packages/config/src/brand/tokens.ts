/**
 * Semantic theme token contract.
 *
 * Exactly 39 keys: 27 base UI tokens + 12 feedback tokens. Every theme MUST
 * provide every key, even where two keys intentionally share a value. Product
 * components consume these semantic names, never raw palette steps or new hard
 * coded hex values.
 *
 * Source of truth: `docs/Dizkarte-Brand-Color-System.md` sections 5 and 6.
 */

export type ThemeColors = {
  // --- Base UI tokens (27) ---
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  surfaceBrand: string;
  surfaceAccent: string;
  logoSurface: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentHighlight: string;
  accentSoft: string;
  onAccent: string;
  link: string;
  borderSubtle: string;
  borderControl: string;
  focusRing: string;
  disabledBackground: string;
  disabledForeground: string;
  overlay: string;
  shadow: string;
  // --- Feedback tokens (12) ---
  successSolid: string;
  successSoft: string;
  successOnSoft: string;
  warningSolid: string;
  warningSoft: string;
  warningOnSoft: string;
  errorSolid: string;
  errorSoft: string;
  errorOnSoft: string;
  infoSolid: string;
  infoSoft: string;
  infoOnSoft: string;
};

/**
 * The canonical ordered list of the 39 semantic token keys. Used by the brand
 * contract tests to assert that both themes expose exactly this set.
 */
export const THEME_TOKEN_KEYS = [
  "background",
  "surface",
  "surfaceElevated",
  "surfaceSubtle",
  "surfaceBrand",
  "surfaceAccent",
  "logoSurface",
  "textPrimary",
  "textSecondary",
  "textInverse",
  "primary",
  "primaryHover",
  "primaryPressed",
  "primarySoft",
  "onPrimary",
  "accent",
  "accentHighlight",
  "accentSoft",
  "onAccent",
  "link",
  "borderSubtle",
  "borderControl",
  "focusRing",
  "disabledBackground",
  "disabledForeground",
  "overlay",
  "shadow",
  "successSolid",
  "successSoft",
  "successOnSoft",
  "warningSolid",
  "warningSoft",
  "warningOnSoft",
  "errorSolid",
  "errorSoft",
  "errorOnSoft",
  "infoSolid",
  "infoSoft",
  "infoOnSoft",
] as const satisfies ReadonlyArray<keyof ThemeColors>;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

/** Number of semantic keys each theme must expose. */
export const THEME_TOKEN_COUNT = 39 as const;

export const lightTheme = {
  background: "#F8F7FC",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#F4F0FB",
  surfaceBrand: "#F7F2FF",
  surfaceAccent: "#FFF9E6",
  logoSurface: "#FFFFFF",
  textPrimary: "#030815",
  textSecondary: "#596274",
  textInverse: "#FFFFFF",
  primary: "#6E20DF",
  primaryHover: "#5B18C2",
  primaryPressed: "#42209D",
  primarySoft: "#EDE3FF",
  onPrimary: "#FFFFFF",
  accent: "#FDBE17",
  accentHighlight: "#FECE32",
  accentSoft: "#FFF1B8",
  onAccent: "#030815",
  link: "#5B18C2",
  borderSubtle: "#E5DEEF",
  borderControl: "#8B7C9E",
  focusRing: "#6E20DF",
  disabledBackground: "#ECEEF3",
  disabledForeground: "#8793A7",
  overlay: "rgba(3, 8, 21, 0.56)",
  shadow: "rgba(3, 8, 21, 0.12)",
  successSolid: "#137A50",
  successSoft: "#E9F8F1",
  successOnSoft: "#0F6B46",
  warningSolid: "#8A5A00",
  warningSoft: "#FFF5D6",
  warningOnSoft: "#6B4500",
  errorSolid: "#B4233B",
  errorSoft: "#FDECEF",
  errorOnSoft: "#9F1833",
  infoSolid: "#1D4ED8",
  infoSoft: "#EAF0FF",
  infoOnSoft: "#173EA6",
} satisfies ThemeColors;

export const darkTheme = {
  background: "#030815",
  surface: "#0D1424",
  surfaceElevated: "#17142B",
  surfaceSubtle: "#111929",
  surfaceBrand: "#2A174A",
  surfaceAccent: "#3B300C",
  logoSurface: "#FFFFFF",
  textPrimary: "#F9F7FF",
  textSecondary: "#B8B3C7",
  textInverse: "#030815",
  primary: "#7B35E8",
  primaryHover: "#8947EC",
  primaryPressed: "#6E20DF",
  primarySoft: "#2A174A",
  onPrimary: "#FFFFFF",
  accent: "#FECE32",
  accentHighlight: "#FECE32",
  accentSoft: "#3B300C",
  onAccent: "#030815",
  link: "#C39CFF",
  borderSubtle: "#312A45",
  borderControl: "#6B5E7C",
  focusRing: "#FDBE17",
  disabledBackground: "#1F2433",
  disabledForeground: "#7F8494",
  overlay: "rgba(1, 3, 10, 0.72)",
  shadow: "rgba(0, 0, 0, 0.40)",
  successSolid: "#137A50",
  successSoft: "#0E2B22",
  successOnSoft: "#65D6A1",
  warningSolid: "#8A5A00",
  warningSoft: "#312509",
  warningOnSoft: "#FFD64A",
  errorSolid: "#B4233B",
  errorSoft: "#35121C",
  errorOnSoft: "#FF8CA0",
  infoSolid: "#1D4ED8",
  infoSoft: "#102145",
  infoOnSoft: "#8DB6FF",
} satisfies ThemeColors;

export type ThemeName = "light" | "dark";

export const themes: Record<ThemeName, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};
