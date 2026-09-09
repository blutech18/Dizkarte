import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listTickets } = vi.hoisted(() => ({
  listTickets: vi.fn((): Promise<any> => new Promise<never>(() => {})),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
  getAdminRepository: () => ({ listTickets }),
}));

const { default: SupportTicketsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("support tickets page streaming shell and filters", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      SupportTicketsPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listTickets).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await SupportTicketsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("binds search, status, and sort criteria to QueueFilters and Suspense key", async () => {
    const shell = (await SupportTicketsPage({
      searchParams: Promise.resolve({
        status: "open",
        q: "billing",
        sort: "oldest",
        page: "3",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/support");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search tickets by reference, subject, requester, or assignee",
      placeholder: "Search reference, subject, requester, assignee...",
      value: "billing",
    });

    expect(props.selects).toHaveLength(2);
    expect(props.selects[0].name).toBe("status");
    expect(props.selects[0].value).toBe("OPEN");
    expect(props.selects[1].name).toBe("sort");
    expect(props.selects[1].value).toBe("oldest");

    const boundary = elements.find(
      (el) => el.type === Suspense && (el.key as string) === "OPEN|billing|oldest|3",
    );
    expect(boundary).toBeDefined();
  });
});
