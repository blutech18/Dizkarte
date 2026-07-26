import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildDisplayNameMap,
  classifyReconciliation,
  derivePaymentIntentStatus,
  displayNameFor,
  pageRange,
  toPayloadHashPreview,
  toProviderEventStatus,
  toProviderReferenceLabel,
  toRefundStatus,
  toWithdrawalStatus,
} from "./supabase-mappers";

describe("derivePaymentIntentStatus", () => {
  it("reports REFUNDED whenever a refund succeeded, regardless of payment state", () => {
    expect(
      derivePaymentIntentStatus({
        dbStatus: "CONFIRMED",
        ledgerTypes: ["PAYMENT_CAPTURE", "RELEASE_TO_TASKER"],
        hasSucceededRefund: true,
      }),
    ).toBe("REFUNDED");
  });

  it("reports RELEASED once the release transaction exists", () => {
    expect(
      derivePaymentIntentStatus({
        dbStatus: "CONFIRMED",
        ledgerTypes: ["PAYMENT_CAPTURE", "RELEASE_TO_TASKER"],
        hasSucceededRefund: false,
      }),
    ).toBe("RELEASED");
  });

  it("reports PROTECTED when captured but not yet released", () => {
    expect(
      derivePaymentIntentStatus({
        dbStatus: "CONFIRMED",
        ledgerTypes: ["PAYMENT_CAPTURE"],
        hasSucceededRefund: false,
      }),
    ).toBe("PROTECTED");
  });

  it("falls back to the raw provider state when no ledger movement exists", () => {
    expect(
      derivePaymentIntentStatus({
        dbStatus: "CONFIRMED",
        ledgerTypes: [],
        hasSucceededRefund: false,
      }),
    ).toBe("CONFIRMED");
    expect(
      derivePaymentIntentStatus({ dbStatus: "PENDING", ledgerTypes: [], hasSucceededRefund: false }),
    ).toBe("PENDING");
    expect(
      derivePaymentIntentStatus({ dbStatus: "CREATED", ledgerTypes: [], hasSucceededRefund: false }),
    ).toBe("CREATED");
  });

  it("reports FAILED even when ledger rows exist, unless a refund succeeded", () => {
    expect(
      derivePaymentIntentStatus({
        dbStatus: "FAILED",
        ledgerTypes: ["PAYMENT_CAPTURE"],
        hasSucceededRefund: false,
      }),
    ).toBe("FAILED");
  });
});

describe("classifyReconciliation", () => {
  it("surfaces a quarantined provider event before any amount comparison", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 999,
        providerEventStatus: "QUARANTINED",
        ledgerAmountCentavos: null,
      }),
    ).toEqual({ status: "QUARANTINED", differenceCentavos: 0 });
  });

  it("surfaces a duplicate provider event before any amount comparison", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 10_000,
        providerEventStatus: "DUPLICATE",
        ledgerAmountCentavos: 10_000,
      }).status,
    ).toBe("DUPLICATE");
  });

  it("reports UNMATCHED when no provider event arrived", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: null,
        providerEventStatus: null,
        ledgerAmountCentavos: 10_000,
      }).status,
    ).toBe("UNMATCHED");
  });

  it("reports MISMATCH with the signed difference when the provider amount differs", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 9_500,
        providerEventStatus: "PROCESSED",
        ledgerAmountCentavos: 10_000,
      }),
    ).toEqual({ status: "MISMATCH", differenceCentavos: -500 });
  });

  it("reports MISMATCH when the ledger disagrees with a matching provider amount", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 10_000,
        providerEventStatus: "PROCESSED",
        ledgerAmountCentavos: 7_500,
      }),
    ).toEqual({ status: "MISMATCH", differenceCentavos: -2_500 });
  });

  it("reports UNMATCHED when the provider confirmed but nothing was recorded in the ledger", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 10_000,
        providerEventStatus: "PROCESSED",
        ledgerAmountCentavos: null,
      }).status,
    ).toBe("UNMATCHED");
  });

  it("reports MATCHED only when payment, provider event, and ledger all agree", () => {
    expect(
      classifyReconciliation({
        paymentAmountCentavos: 10_000,
        providerEventAmountCentavos: 10_000,
        providerEventStatus: "PROCESSED",
        ledgerAmountCentavos: 10_000,
      }),
    ).toEqual({ status: "MATCHED", differenceCentavos: 0 });
  });
});

describe("privacy-safe provider labels", () => {
  it("never renders the full provider reference", () => {
    const reference = "pi_live_ABCDEF1234567890";
    const label = toProviderReferenceLabel("acme-pay", reference);
    expect(label).toBe("acme-pay: ...567890");
    expect(label).not.toContain(reference);
  });

  it("handles a missing reference without inventing one", () => {
    expect(toProviderReferenceLabel("acme-pay", null)).toBe("acme-pay: (no reference)");
  });

  it("truncates the payload hash and never returns the payload", () => {
    expect(toPayloadHashPreview("0123456789abcdef0123456789abcdef")).toBe("0123456789ab...");
    expect(toPayloadHashPreview(null)).toBe("(no hash)");
  });
});

describe("defensive enum coercion", () => {
  it("treats an unknown provider-event state as QUARANTINED", () => {
    expect(toProviderEventStatus("PROCESSED")).toBe("PROCESSED");
    expect(toProviderEventStatus("something-else")).toBe("QUARANTINED");
    expect(toProviderEventStatus(null)).toBe("QUARANTINED");
  });

  it("treats an unknown refund or withdrawal state as FAILED", () => {
    expect(toRefundStatus("SUCCEEDED")).toBe("SUCCEEDED");
    expect(toRefundStatus("bogus")).toBe("FAILED");
    expect(toWithdrawalStatus("PAID")).toBe("PAID");
    expect(toWithdrawalStatus(undefined)).toBe("FAILED");
  });
});

describe("display names", () => {
  it("falls back to a short id fragment instead of leaking another identifier", () => {
    const map = buildDisplayNameMap([
      {
        id: "11111111-2222-3333-4444-555555555555",
        display_name: "  ",
        account_status: "active",
        created_at: null,
      },
    ]);
    expect(map.get("11111111-2222-3333-4444-555555555555")).toBe("User 11111111");
  });

  it("labels a null assignee as Unassigned", () => {
    expect(displayNameFor(new Map(), null)).toBe("Unassigned");
  });
});

describe("pageRange", () => {
  it("converts a 1-based page into zero-based inclusive bounds", () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it("clamps invalid input and caps the page size", () => {
    expect(pageRange(0, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(1, 1000)).toEqual({ from: 0, to: 99 });
    expect(pageRange(Number.NaN, Number.NaN)).toEqual({ from: 0, to: 19 });
  });
});
