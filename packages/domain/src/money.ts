import { z } from "zod";
import { MONEY_LIMITS, SUPPORTED_CURRENCY, type SupportedCurrency } from "@dizkarte/config";
import { DomainError } from "./errors.js";

/**
 * Money is always represented as integer centavos in PHP. Floating-point,
 * fractional, negative, out-of-range, and foreign-currency values are rejected.
 * Displayed balances are derived from ledger queries, never mutated directly.
 */

export type Money = {
  readonly centavos: number;
  readonly currency: SupportedCurrency;
};

export class MoneyError extends DomainError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
    this.name = "MoneyError";
  }
}

export function isSafeCentavos(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    Object.is(value, value) // excludes NaN
  );
}

/** Construct a Money value in PHP centavos. Rejects invalid inputs. */
export function money(centavos: number, currency: SupportedCurrency = SUPPORTED_CURRENCY): Money {
  if (currency !== SUPPORTED_CURRENCY) {
    throw new MoneyError(`Unsupported currency: ${String(currency)}. Only ${SUPPORTED_CURRENCY}.`);
  }
  if (!isSafeCentavos(centavos)) {
    throw new MoneyError("Amount must be an integer number of centavos.");
  }
  return { centavos, currency };
}

/** Non-negative amount within the configured maximum safeguard. */
export function assertAmountInBounds(centavos: number, { allowZero = true } = {}): void {
  if (!isSafeCentavos(centavos)) {
    throw new MoneyError("Amount must be an integer number of centavos.");
  }
  if (centavos < 0) {
    throw new MoneyError("Amount cannot be negative.");
  }
  if (!allowZero && centavos === 0) {
    throw new MoneyError("Amount must be greater than zero.");
  }
  if (centavos > MONEY_LIMITS.maxAmountCentavos) {
    throw new MoneyError("Amount exceeds the maximum allowed value.");
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.centavos + b.centavos, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.centavos - b.centavos, a.currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError("Cannot combine amounts in different currencies.");
  }
}

/**
 * Apply a fee expressed in basis points using banker-safe integer math.
 * Fee rate defaults to zero and is never hard-coded to a business rate.
 */
export function applyFeeBps(centavos: number, feeBps: number): { fee: number; net: number } {
  assertAmountInBounds(centavos);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new MoneyError("Fee basis points must be an integer between 0 and 10000.");
  }
  // Round half-up on the fee, keeping everything in integer centavos.
  const fee = Math.round((centavos * feeBps) / 10_000);
  return { fee, net: centavos - fee };
}

/** Format centavos as a PHP display string. Presentation only. */
export function formatPhp(centavos: number): string {
  assertAmountInBounds(centavos);
  const pesos = Math.floor(centavos / 100);
  const remainder = String(centavos % 100).padStart(2, "0");
  return `₱${pesos.toLocaleString("en-PH")}.${remainder}`;
}

/**
 * Zod schema for an integer-centavo amount from untrusted input. Rejects
 * floats, NaN, negatives, and out-of-range values. `min` defaults to 1 centavo.
 */
export function centavosSchema(options: { min?: number; max?: number } = {}) {
  const min = options.min ?? 1;
  const max = options.max ?? MONEY_LIMITS.maxAmountCentavos;
  return z
    .number()
    .int("Amount must be an integer number of centavos.")
    .finite()
    .min(min, `Amount must be at least ${min} centavos.`)
    .max(max, `Amount must be at most ${max} centavos.`);
}

/** Currency schema that only accepts PHP. */
export const currencySchema = z.literal(SUPPORTED_CURRENCY);
