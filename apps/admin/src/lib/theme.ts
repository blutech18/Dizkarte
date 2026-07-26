import { lightTheme } from "@dizkarte/config";

/**
 * Emit the light theme as CSS custom properties (`--dk-<token>`).
 *
 * Requirement: light UI by default, no user-facing dark-mode switch. Dark
 * tokens exist in `@dizkarte/config` as a contract but are intentionally not
 * wired into a runtime switch here.
 *
 * Product CSS/components must reference `var(--dk-*)` — never a new
 * hard-coded brand hex value.
 */
export function themeCssVariables(): string {
  const lines = Object.entries(lightTheme).map(([key, value]) => `  --dk-${key}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
