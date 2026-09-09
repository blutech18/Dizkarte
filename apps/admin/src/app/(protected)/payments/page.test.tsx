import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listPaymentIntents, getFinanceSummary, getFinanceProviderAvailability } = vi.hoisted(() => ({
  listPaymentIntents: vi.fn((): Promise<any> => new Promise<never>(() => {})),
  getFinanceSummary: vi.fn(async () => ({
    synthetic: true,
    protectedCentavos: 100000,
    capturedCentavos: 150000,
    releasedCentavos: 50000,
    refundedCentavos: 0,
    platformFeeCentavos: 15000,
    platformFeeBps: 1000,
    ledgerBalanceCentavos: 0,
  })),
  getFinanceProviderAvailability: vi.fn(async () => ({
    available: false,
    reason: "Synthetic sandbox active",
  })),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
    listPaymentIntents,
    getFinanceSummary,
    getFinanceProviderAvailability,
    listProviderEvents: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false })),
  }),
}));

const { default: PaymentsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("payments page streaming shell", () => {
  it("resolves its shell immediately behind a Suspense boundary", async () => {
    const shell = (await PaymentsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(shell).toBeTruthy();

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });
});
