import { THEME_TOKEN_KEYS, type ThemeColors } from "./tokens.js";

/**
 * Convert a semantic theme into CSS custom properties of the form
 * `--color-<token>`. Consumed by the Admin web app; mobile maps the same
 * `ThemeColors` object to a typed React Native theme instead.
 */
export function themeToCssVariables(
  theme: ThemeColors,
  prefix = "--color-",
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of THEME_TOKEN_KEYS) {
    vars[`${prefix}${toKebabCase(key)}`] = theme[key];
  }
  return vars;
}

/** Serialize CSS variables into a declaration block body. */
export function themeToCssBlock(theme: ThemeColors, prefix = "--color-"): string {
  const vars = themeToCssVariables(theme, prefix);
  return Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
