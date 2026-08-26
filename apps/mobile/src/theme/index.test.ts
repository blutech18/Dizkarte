import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

import { responsiveLayoutForWidth } from "./index";

describe("responsiveLayoutForWidth", () => {
  it("uses the narrowest gutters below 350 logical points", () => {
    expect(responsiveLayoutForWidth(320)).toMatchObject({
      isNarrowPhone: true,
      isCompactPhone: true,
      isTablet: false,
      gutter: 14,
      contentWidth: 320,
    });
  });

  it("uses compact gutters for iPhone SE and mini widths", () => {
    expect(responsiveLayoutForWidth(375)).toMatchObject({
      isNarrowPhone: false,
      isCompactPhone: true,
      isTablet: false,
      gutter: 16,
      contentWidth: 375,
    });
  });

  it.each([390, 393, 402, 420, 440])(
    "keeps standard phone spacing at %i logical points",
    (width) => {
      expect(responsiveLayoutForWidth(width)).toMatchObject({
        isNarrowPhone: false,
        isCompactPhone: false,
        isTablet: false,
        gutter: 20,
        contentWidth: width,
      });
    },
  );

  it("retains the existing capped tablet layout", () => {
    expect(responsiveLayoutForWidth(768)).toMatchObject({
      isNarrowPhone: false,
      isCompactPhone: false,
      isTablet: true,
      gutter: 40,
      contentWidth: 720,
    });
  });
});
