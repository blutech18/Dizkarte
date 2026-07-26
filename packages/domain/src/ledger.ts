import { DomainError } from "./errors.js";
import { isSafeCentavos } from "./money.js";
import type { LedgerAccountId } from "./ids.js";

/**
 * Double-entry ledger primitives.
 *
 * Every ledger transaction is a set of signed integer-centavo entries that MUST
 * sum to exactly zero. Entries are immutable and append-only; balances are
 * always derived, never stored as an authoritative mutable column.
 */

export const LEDGER_ACCOUNT_TYPES = [
  "CLIENT_FUNDING", // external funds entering the system
  "PROTECTED_HOLD", // funds held pending release (neutral "protected", not legal escrow)
  "TASKER_AVAILABLE", // cleared funds a Tasker may withdraw
  "PLATFORM_FEE", // platform fee revenue
  "PAYOUT_CLEARING", // funds reserved for an outgoing payout
  "REFUND_CLEARING", // funds reserved for an outgoing refund
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const LEDGER_TRANSACTION_TYPES = [
  "PAYMENT_CAPTURE",
  "RELEASE_TO_TASKER",
  "FEE_CHARGE",
  "REFUND",
  "WITHDRAWAL_RESERVE",
  "WITHDRAWAL_SETTLE",
  "WITHDRAWAL_REVERSE",
  "FREEZE",
  "UNFREEZE",
] as const;
export type LedgerTransactionType = (typeof LEDGER_TRANSACTION_TYPES)[number];

export type LedgerEntryInput = {
  readonly accountId: LedgerAccountId;
  /** Signed integer centavos; positive = debit-to-account, negative = credit. */
  readonly amountCentavos: number;
};

/**
 * Validate that a proposed transaction is balanced and well-formed.
 * Throws INVALID_STATE / VALIDATION_ERROR DomainErrors on violation.
 */
export function assertBalancedTransaction(entries: ReadonlyArray<LedgerEntryInput>): void {
  if (entries.length < 2) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "A ledger transaction requires at least two entries.",
    );
  }
  let sum = 0;
  for (const entry of entries) {
    if (!isSafeCentavos(entry.amountCentavos)) {
      throw new DomainError("VALIDATION_ERROR", "Ledger entries must be integer centavos.");
    }
    if (entry.amountCentavos === 0) {
      throw new DomainError("VALIDATION_ERROR", "Ledger entries cannot be zero.");
    }
    sum += entry.amountCentavos;
  }
  if (sum !== 0) {
    throw new DomainError("INVALID_STATE", `Ledger transaction is not balanced (sum=${sum}).`);
  }
}

export function isBalanced(entries: ReadonlyArray<LedgerEntryInput>): boolean {
  try {
    assertBalancedTransaction(entries);
    return true;
  } catch {
    return false;
  }
}

/** Derive a per-account net balance from a flat list of entries. */
export function deriveBalances(
  entries: ReadonlyArray<LedgerEntryInput>,
): Map<LedgerAccountId, number> {
  const balances = new Map<LedgerAccountId, number>();
  for (const entry of entries) {
    balances.set(entry.accountId, (balances.get(entry.accountId) ?? 0) + entry.amountCentavos);
  }
  return balances;
}
