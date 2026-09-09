import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listRefunds, getFinanceProviderAvailability } = vi.hoisted(() => ({
  listRefunds: vi.fn((): Promise<any> => new Promise<never>(() => {})),
  getFinanceProviderAvailability: vi.fn(() => ({
    available: true,
    reason: "Ready",
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
    listRefunds,
    getFinanceProviderAvailability,
  }),
}));

const { default: RefundsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("refunds page streaming shell and filters", () => {
  it("resolves its shell immediately without awaiting row listings", async () => {
    const shell = await Promise.race([
      RefundsPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listRefunds).not.toHaveBeenCalled();
  });

  it("puts the row listing behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await RefundsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("binds search, status, and sort criteria to QueueFilters and Suspense key", async () => {
    const shell = (await RefundsPage({
      searchParams: Promise.resolve({
        status: "SUCCEEDED",
        q: "client canceled",
        sort: "amount_desc",
        page: "2",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/refunds");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search refunds by booking, payment, or reason",
      placeholder: "Search booking ID, payment ID, reason...",
      value: "client canceled",
    });

    expect(props.selects).toHaveLength(2);
    expect(props.selects[0].name).toBe("status");
    expect(props.selects[0].value).toBe("SUCCEEDED");
    expect(props.selects[1].name).toBe("sort");
    expect(props.selects[1].value).toBe("amount_desc");

    const boundary = elements.find(
      (el) => el.type === Suspense && (el.key as string) === "SUCCEEDED|client canceled|amount_desc|2",
    );
    expect(boundary).toBeDefined();
  });
});
