import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listDisputes } = vi.hoisted(() => ({
  listDisputes: vi.fn((): Promise<any> => new Promise<never>(() => {})),
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
  getAdminRepository: () => ({ listDisputes }),
}));

const { default: DisputesPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("disputes page streaming shell and filters", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      DisputesPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listDisputes).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await DisputesPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("binds search, status, and sort criteria to QueueFilters and Suspense key", async () => {
    const shell = (await DisputesPage({
      searchParams: Promise.resolve({
        status: "open",
        q: "dispute-123",
        sort: "amount_desc",
        page: "2",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/disputes");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search disputes by reference, booking, or assignee",
      placeholder: "Search reference, booking ID, assignee...",
      value: "dispute-123",
    });

    expect(props.selects).toHaveLength(2);
    expect(props.selects[0].name).toBe("status");
    expect(props.selects[0].value).toBe("OPEN");
    expect(props.selects[1].name).toBe("sort");
    expect(props.selects[1].value).toBe("amount_desc");

    const boundary = elements.find(
      (el) => el.type === Suspense && (el.key as string) === "OPEN|dispute-123|amount_desc|2",
    );
    expect(boundary).toBeDefined();
  });
});
