import { describe, expect, it } from "vitest";
import {
  addMoney,
  applyFeeBps,
  centavosSchema,
  currencySchema,
  formatPhp,
  MoneyError,
  money,
  subtractMoney,
} from "./money.js";

describe("money construction", () => {
  it("accepts valid integer centavos in PHP", () => {
    expect(money(12345)).toEqual({ centavos: 12345, currency: "PHP" });
  });

  it("rejects floating-point centavos", () => {
    expect(() => money(10.5)).toThrow(MoneyError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => money(Number.NaN)).toThrow(MoneyError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it("rejects non-PHP currency", () => {
    // @ts-expect-error deliberately passing an unsupported currency at runtime.
    expect(() => money(100, "USD")).toThrow(MoneyError);
  });
});

describe("money arithmetic", () => {
  it("adds and subtracts", () => {
    expect(addMoney(money(100), money(250)).centavos).toBe(350);
    expect(subtractMoney(money(500), money(200)).centavos).toBe(300);
  });
});

describe("applyFeeBps", () => {
  it("defaults to zero fee (no hard-coded rate)", () => {
    expect(applyFeeBps(10000, 0)).toEqual({ fee: 0, net: 10000 });
  });

  it("computes an 8% illustrative fee via bps", () => {
    expect(applyFeeBps(10000, 800)).toEqual({ fee: 800, net: 9200 });
  });

  it("rounds fees to the nearest centavo", () => {
    expect(applyFeeBps(333, 800)).toEqual({ fee: 27, net: 306 });
  });

  it("rejects out-of-range bps", () => {
    expect(() => applyFeeBps(1000, 10001)).toThrow(MoneyError);
    expect(() => applyFeeBps(1000, -1)).toThrow(MoneyError);
  });
});

describe("formatPhp", () => {
  it("formats centavos as PHP", () => {
    expect(formatPhp(123456)).toBe("₱1,234.56");
    expect(formatPhp(5)).toBe("₱0.05");
  });
});

describe("centavosSchema", () => {
  const schema = centavosSchema({ min: 2000 });

  it("accepts a valid integer at/above min", () => {
    expect(schema.parse(2000)).toBe(2000);
  });

  it("rejects floats and below-min values", () => {
    expect(schema.safeParse(19.99).success).toBe(false);
    expect(schema.safeParse(1999).success).toBe(false);
  });

  it("currencySchema only accepts PHP", () => {
    expect(currencySchema.safeParse("PHP").success).toBe(true);
    expect(currencySchema.safeParse("USD").success).toBe(false);
  });
});
