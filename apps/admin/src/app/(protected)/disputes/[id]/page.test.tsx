import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dispute = {
  id: "disp-101",
  bookingId: "book-101",
  taskId: "task-101",
  reason: "Service not completed as described",
  status: "OPEN",
  assignee: null,
  amountCentavos: 150000,
  openedAt: "2026-09-01T10:00:00.000Z",
  access: { restricted: false },
  createdAt: "2026-09-01T10:00:00.000Z",
  openedByDisplayName: "Maria Santos",
  evidence: [],
  history: [],
  subject: null,
};

const { getDispute, getFinanceProviderAvailability, getPaymentIntentByBooking } = vi.hoisted(() => ({
  getDispute: vi.fn(async () => dispute),
  getFinanceProviderAvailability: vi.fn(async () => ({ available: true, message: "OK" })),
  getPaymentIntentByBooking: vi.fn(async () => null),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/guard", () => ({
  requirePageCapability: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Support Admin",
    email: "support@dizkarte.test",
    capabilities: ["ADMIN_SUPPORT"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({
    getDispute,
    getFinanceProviderAvailability,
    getPaymentIntentByBooking,
  }),
}));

const { default: DisputeDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("dispute detail page", () => {
  it("renders breadcrumbs and puts record behind Suspense boundary", async () => {
    const shell = (await DisputeDetailPage({
      params: Promise.resolve({ id: dispute.id }),
    })) as ReactElement;

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });

  it("renders dispute record and assigns actions panel with pure serializable props", async () => {
    const shell = (await DisputeDetailPage({
      params: Promise.resolve({ id: dispute.id }),
    })) as ReactElement;

    const recordElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "DisputeCaseRecord",
    );
    expect(recordElement).toBeDefined();

    const resolved = await (recordElement!.type as (props: unknown) => Promise<ReactElement>)(recordElement!.props);
    const html = renderToStaticMarkup(resolved);

    expect(html).toContain("Dispute on booking book-101");
    expect(html).toContain("₱1,500.00");
    expect(html).toContain("Assign to me");
  });
});
