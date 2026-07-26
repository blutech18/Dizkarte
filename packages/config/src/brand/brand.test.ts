import { describe, expect, it } from "vitest";
import {
  brandGradients,
  darkTheme,
  lightTheme,
  themes,
  themeToCssVariables,
  THEME_TOKEN_COUNT,
  THEME_TOKEN_KEYS,
  type ThemeColors,
} from "../index.js";

const HEX_OR_RGBA = /^(#[0-9A-Fa-f]{6}|rgba?\([^)]*\))$/;

describe("brand token contract", () => {
  it("declares exactly 39 semantic keys with no duplicates", () => {
    expect(THEME_TOKEN_KEYS).toHaveLength(THEME_TOKEN_COUNT);
    expect(new Set(THEME_TOKEN_KEYS).size).toBe(THEME_TOKEN_COUNT);
  });

  for (const [name, theme] of Object.entries(themes)) {
    describe(`${name} theme`, () => {
      it("provides every one of the 39 keys", () => {
        const keys = Object.keys(theme).sort();
        expect(keys).toHaveLength(THEME_TOKEN_COUNT);
        for (const key of THEME_TOKEN_KEYS) {
          expect(theme[key], `missing key ${key}`).toBeTruthy();
        }
      });

      it("exposes no extra keys beyond the contract", () => {
        const allowed = new Set<string>(THEME_TOKEN_KEYS);
        for (const key of Object.keys(theme)) {
          expect(allowed.has(key), `unexpected key ${key}`).toBe(true);
        }
      });

      it("has valid hex or rgba values for every token", () => {
        for (const key of THEME_TOKEN_KEYS) {
          expect(theme[key], `${key} = ${theme[key]}`).toMatch(HEX_OR_RGBA);
        }
      });
    });
  }

  it("uses navy (never white) as onAccent in both themes", () => {
    expect(lightTheme.onAccent).toBe("#030815");
    expect(darkTheme.onAccent).toBe("#030815");
  });

  it("uses white as onPrimary in both themes", () => {
    expect(lightTheme.onPrimary).toBe("#FFFFFF");
    expect(darkTheme.onPrimary).toBe("#FFFFFF");
  });

  it("keeps the logo plate white in both themes", () => {
    expect(lightTheme.logoSurface).toBe("#FFFFFF");
    expect(darkTheme.logoSurface).toBe("#FFFFFF");
  });

  it("anchors canonical brand values", () => {
    expect(lightTheme.primary).toBe("#6E20DF");
    expect(lightTheme.primaryPressed).toBe("#42209D");
    expect(lightTheme.accent).toBe("#FDBE17");
    expect(lightTheme.accentHighlight).toBe("#FECE32");
    expect(lightTheme.textPrimary).toBe("#030815");
    expect(darkTheme.background).toBe("#030815");
  });
});

describe("brand gradients", () => {
  it("exposes the three approved gradients with valid css", () => {
    const ids = Object.values(brandGradients).map((g) => g.id);
    expect(ids).toEqual(["icon-authentic-purple", "deep-brand-purple", "ray-accent"]);
    for (const gradient of Object.values(brandGradients)) {
      expect(gradient.css).toMatch(/^linear-gradient\(/);
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("themeToCssVariables", () => {
  it("emits kebab-cased custom properties for all 39 tokens", () => {
    const vars = themeToCssVariables(lightTheme);
    expect(Object.keys(vars)).toHaveLength(THEME_TOKEN_COUNT);
    expect(vars["--color-text-primary"]).toBe("#030815");
    expect(vars["--color-success-on-soft"]).toBe(lightTheme.successOnSoft);
  });
});

// Compile-time guarantee that both themes satisfy the same contract.
const _assertLight: ThemeColors = lightTheme;
const _assertDark: ThemeColors = darkTheme;
void _assertLight;
void _assertDark;
