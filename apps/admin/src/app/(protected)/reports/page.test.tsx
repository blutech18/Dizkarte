import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listReports } = vi.hoisted(() => ({
  listReports: vi.fn((): Promise<any> => new Promise<never>(() => {})),
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
  getAdminRepository: () => ({ listReports }),
}));

const { default: ReportsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("reports page streaming shell and filters", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      ReportsPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listReports).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await ReportsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("binds search and multi-filter criteria to QueueFilters and Suspense key", async () => {
    const shell = (await ReportsPage({
      searchParams: Promise.resolve({
        status: "open",
        type: "task",
        q: "fraud",
        sort: "oldest",
        page: "2",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/reports");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search reports by reference, category, or assignee",
      placeholder: "Search reference, category, assignee...",
      value: "fraud",
    });

    expect(props.selects).toHaveLength(3);
    expect(props.selects[0].name).toBe("status");
    expect(props.selects[0].value).toBe("OPEN");
    expect(props.selects[1].name).toBe("type");
    expect(props.selects[1].value).toBe("task");
    expect(props.selects[2].name).toBe("sort");
    expect(props.selects[2].value).toBe("oldest");

    const boundary = elements.find(
      (el) => el.type === Suspense && (el.key as string) === "OPEN|task|fraud|oldest|2",
    );
    expect(boundary).toBeDefined();
  });
});

