import { describe, expect, it } from "vitest";
import {
  assertBalancedTransaction,
  deriveBalances,
  isBalanced,
  type LedgerAccountId,
  type LedgerEntryInput,
} from "./index.js";

const acc = (n: number): LedgerAccountId =>
  `00000000-0000-4000-8000-00000000010${n}` as LedgerAccountId;

describe("ledger balance rules", () => {
  it("accepts a balanced two-entry transaction", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: acc(1), amountCentavos: 10000 },
      { accountId: acc(2), amountCentavos: -10000 },
    ];
    expect(isBalanced(entries)).toBe(true);
    expect(() => assertBalancedTransaction(entries)).not.toThrow();
  });

  it("accepts a balanced multi-entry payment+fee split", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: acc(1), amountCentavos: 10000 }, // funding in
      { accountId: acc(2), amountCentavos: -9200 }, // protected hold
      { accountId: acc(3), amountCentavos: -800 }, // platform fee
    ];
    expect(isBalanced(entries)).toBe(true);
  });

  it("rejects an unbalanced transaction", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: acc(1), amountCentavos: 10000 },
      { accountId: acc(2), amountCentavos: -9999 },
    ];
    expect(isBalanced(entries)).toBe(false);
    expect(() => assertBalancedTransaction(entries)).toThrow(/not balanced/i);
  });

  it("rejects zero-amount entries", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: acc(1), amountCentavos: 0 },
      { accountId: acc(2), amountCentavos: 0 },
    ];
    expect(() => assertBalancedTransaction(entries)).toThrow(/cannot be zero/i);
  });

  it("rejects fewer than two entries", () => {
    expect(() => assertBalancedTransaction([{ accountId: acc(1), amountCentavos: 100 }])).toThrow(
      /at least two/i,
    );
  });

  it("rejects non-integer amounts", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: acc(1), amountCentavos: 100.5 },
      { accountId: acc(2), amountCentavos: -100.5 },
    ];
    expect(() => assertBalancedTransaction(entries)).toThrow(/integer centavos/i);
  });

  it("derives per-account balances", () => {
    const balances = deriveBalances([
      { accountId: acc(1), amountCentavos: 10000 },
      { accountId: acc(1), amountCentavos: -4000 },
      { accountId: acc(2), amountCentavos: -6000 },
    ]);
    expect(balances.get(acc(1))).toBe(6000);
    expect(balances.get(acc(2))).toBe(-6000);
  });
});
