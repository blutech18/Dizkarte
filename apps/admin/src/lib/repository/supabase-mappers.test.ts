import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildDisplayNameMap,
  classifyReconciliation,
  derivePaymentIntentStatus,
  displayNameFor,
  mapCaseSubject,
  mapReportTriage,
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
      derivePaymentIntentStatus({
        dbStatus: "PENDING",
        ledgerTypes: [],
        hasSucceededRefund: false,
      }),
    ).toBe("PENDING");
    expect(
      derivePaymentIntentStatus({
        dbStatus: "CREATED",
        ledgerTypes: [],
        hasSucceededRefund: false,
      }),
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

describe("mapCaseSubject", () => {
  const payload = {
    exists: true,
    kind: "message",
    label: 'Message from "Tasker Dos" in booking e5000000',
    status: "APPROVED",
    body: "Pay me outside the app or I walk.",
    occurredAt: "2026-08-24T10:00:00.000Z",
    subjectUserId: "c2222222-2222-2222-2222-222222222222",
    subjectUserName: "Tasker Dos",
    counterpartyName: "Client Uno",
    taskId: "a5000000-0000-0000-0000-000000000001",
    taskTitle: "Deep clean 2BR condo",
    bookingId: "e5000000-0000-0000-0000-000000000001",
    amountCentavos: null,
    extra: { bookingStatus: "CONFIRMED", attachmentCount: 2 },
  };

  it("projects a resolved subject as-is", () => {
    const subject = mapCaseSubject(payload, "message");
    expect(subject.exists).toBe(true);
    expect(subject.body).toBe("Pay me outside the app or I walk.");
    expect(subject.subjectUserName).toBe("Tasker Dos");
    expect(subject.extra).toEqual({ bookingStatus: "CONFIRMED", attachmentCount: 2 });
  });

  it("keeps a centavo amount that PostgREST rendered as a string", () => {
    // bigint crosses the wire as text; losing it would silently show no amount.
    const subject = mapCaseSubject({ ...payload, amountCentavos: "340000" }, "booking");
    expect(subject.amountCentavos).toBe(340000);
  });

  it("degrades to a non-existent subject instead of throwing", () => {
    // A case page must still open when the resolver returned nothing.
    for (const bad of [null, undefined, "not json", 42]) {
      const subject = mapCaseSubject(bad, "task");
      expect(subject.exists).toBe(false);
      expect(subject.kind).toBe("task");
      expect(subject.label).toContain("could not be resolved");
      expect(subject.body).toBeNull();
    }
  });

  it("treats a deleted resource as existing=false with the server's label", () => {
    const subject = mapCaseSubject(
      { exists: false, kind: "message", label: "This message no longer exists" },
      "message",
    );
    expect(subject.exists).toBe(false);
    expect(subject.label).toBe("This message no longer exists");
  });

  it("drops nested objects from extras rather than rendering [object Object]", () => {
    const subject = mapCaseSubject(
      { ...payload, extra: { flag: true, nested: { a: 1 }, missing: null, count: "7" } },
      "message",
    );
    expect(subject.extra).toEqual({ flag: true, missing: null, count: "7" });
  });

  it("does not accept an empty string as a value", () => {
    // An empty label would render a blank card; null makes the fallback fire.
    const subject = mapCaseSubject({ ...payload, label: "", status: "" }, "message");
    expect(subject.label).toContain("could not be resolved");
    expect(subject.status).toBeNull();
  });
});

describe("mapReportTriage", () => {
  const payload = {
    reporter: {
      id: "c1111111-1111-1111-1111-111111111111",
      displayName: "Client Uno",
      accountStatus: "active",
      reportsFiled: 3,
      reportsDismissed: 1,
    },
    resourceReportSummary: { distinctReporters: 2, openCases: 2, actionedCases: 0 },
  };

  it("projects reporter identity and pile-on counts", () => {
    const triage = mapReportTriage(payload);
    expect(triage?.reporter.displayName).toBe("Client Uno");
    expect(triage?.reporter.reportsDismissed).toBe(1);
    expect(triage?.distinctReporters).toBe(2);
  });

  it("accepts counts that arrived as strings", () => {
    const triage = mapReportTriage({
      reporter: { ...payload.reporter, reportsFiled: "3" },
      resourceReportSummary: { distinctReporters: "2", openCases: "2", actionedCases: "0" },
    });
    expect(triage?.reporter.reportsFiled).toBe(3);
    expect(triage?.openCases).toBe(2);
  });

  it("returns null when the block is absent instead of inventing zeros", () => {
    // "No other reports" and "we could not tell" must not look identical.
    expect(mapReportTriage(null)).toBeNull();
    expect(mapReportTriage({})).toBeNull();
    expect(mapReportTriage({ reporter: payload.reporter })).toBeNull();
  });
});
