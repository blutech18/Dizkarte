import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const paymentIntent = {
  id: "3b32ec79-e5c1-4440-bdab-4f2949a2bfa1",
  bookingId: "e167d9fa-9115-4e10-948c-1cb9e0cbcbb4",
  status: "PROTECTED" as const,
  amountCentavos: 250_000,
  platformFeeCentavos: 25_000,
  createdAt: "2026-08-29T10:00:00.000Z",
  refundSummary: {
    totalRefundedCentavos: 0,
    refundCount: 0,
  },
  refundHistory: [],
  providerEvents: [],
  ledgerTransactionIds: ["tx-001"],
  reconciliationStatus: "MATCHED" as const,
  history: [],
};

const availability = {
  configured: false,
  healthy: false,
  reason: "No approved Philippine payment provider integration exists yet.",
};

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(),
}));

vi.mock("@/lib/guard", () => ({
  requirePageCapability: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Finance Admin",
    email: "finance@dizkarte.test",
    capabilities: ["ADMIN_FINANCE"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({
    getPaymentIntent: async () => paymentIntent,
    getFinanceProviderAvailability: async () => availability,
  }),
}));

const { default: PaymentDetailPage } = await import("./page");

/** Every descendant element of a tree, depth-first. */
function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

async function renderRecord(): Promise<string> {
  const shell = await PaymentDetailPage({
    params: Promise.resolve({ id: paymentIntent.id }),
  });

  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");

  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("payment record layout", () => {
  it("renders a single h1 with formatted booking reference", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("Payment on Booking BK-20260829-E167");
  });

  it("renders the hero card and 2-column grid layout", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-booking-hero");
    expect(html).toContain("dk-booking-grid");
    expect(html).toContain("dk-booking-col");
  });

  it("presents financial amounts cleanly in Philippine Pesos", async () => {
    const html = await renderRecord();

    expect(html).toContain("₱2,500.00");
    expect(html).toContain("₱250.00");
    expect(html).toContain("Amounts Breakdown");
    expect(html).toContain("Net Platform Fee");
  });

  it("includes live provider actions, reconciliation status, provider events, and history", async () => {
    const html = await renderRecord();

    expect(html).toContain("Live Provider Actions");
    expect(html).toContain("Reconciliation Status");
    expect(html).toContain("Matched");
    expect(html).toContain("Provider Events");
    expect(html).toContain("Refund History");
    expect(html).toContain("History");
  });
});
