import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ticket = {
  id: "tick-101",
  subject: "Cannot update payment method",
  category: "Billing",
  status: "OPEN",
  assignee: null,
  requesterDisplayName: "Juan Dela Cruz",
  access: { restricted: false },
  caseSubject: {
    resourceLabel: "User Account: Juan Dela Cruz",
    resourceType: "user",
    resourceId: "user-101",
  },
  narrative: "User is experiencing payment issues.",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  evidence: [],
  history: [],
};

const { getTicket } = vi.hoisted(() => ({
  getTicket: vi.fn(async () => ticket),
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
    getTicket,
  }),
}));

const { default: SupportTicketDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("support detail page", () => {
  it("renders breadcrumbs and puts record behind Suspense boundary", async () => {
    const shell = (await SupportTicketDetailPage({
      params: Promise.resolve({ id: ticket.id }),
    })) as ReactElement;

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });

  it("renders support ticket record and assigns actions panel with pure serializable props", async () => {
    const shell = (await SupportTicketDetailPage({
      params: Promise.resolve({ id: ticket.id }),
    })) as ReactElement;

    const recordElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "SupportTicketRecord",
    );
    expect(recordElement).toBeDefined();

    const resolved = await (recordElement!.type as (props: unknown) => Promise<ReactElement>)(recordElement!.props);
    const html = renderToStaticMarkup(resolved);

    expect(html).toContain("Cannot update payment method");
    expect(html).toContain("Juan Dela Cruz");
    expect(html).toContain("Assign to me");
  });
});
