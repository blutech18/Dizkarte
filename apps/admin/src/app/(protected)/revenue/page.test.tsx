import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { getFinanceSummary } = vi.hoisted(() => ({
  getFinanceSummary: vi.fn(async () => ({
    synthetic: true,
    protectedCentavos: 100000,
    capturedCentavos: 150000,
    releasedCentavos: 50000,
    refundedCentavos: 0,
    platformFeeCentavos: 0,
    platformFeeBps: 0,
    ledgerBalanceCentavos: 0,
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
    getFinanceSummary,
  }),
}));

const { default: RevenuePage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("revenue page streaming shell", () => {
  it("resolves its shell immediately behind a Suspense boundary", async () => {
    const shell = (await RevenuePage()) as ReactElement;
    expect(shell).toBeTruthy();

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });
});
