import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listReconciliationRows, getReconciliationSummary } = vi.hoisted(() => ({
  listReconciliationRows: vi.fn((): Promise<any> => new Promise<never>(() => {})),
  getReconciliationSummary: vi.fn(async () => ({
    matched: 10,
    duplicate: 1,
    quarantined: 0,
    mismatch: 2,
    unmatched: 1,
    total: 14,
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
    synthetic: true,
    listReconciliationRows,
    getReconciliationSummary,
  }),
}));

const { default: ReconciliationPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("reconciliation page streaming shell and filters", () => {
  it("resolves its shell immediately without awaiting row listings", async () => {
    const shell = await Promise.race([
      ReconciliationPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listReconciliationRows).not.toHaveBeenCalled();
  });

  it("puts the row listing behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await ReconciliationPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
  });

  it("binds search, status, and sort criteria to QueueFilters and Suspense key", async () => {
    const shell = (await ReconciliationPage({
      searchParams: Promise.resolve({
        status: "MATCHED",
        q: "booking-99",
        sort: "diff_desc",
        page: "2",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/reconciliation");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search reconciliation by booking or payment reference",
      placeholder: "Search booking, payment reference...",
      value: "booking-99",
    });

    expect(props.selects).toHaveLength(2);
    expect(props.selects[0].name).toBe("status");
    expect(props.selects[0].value).toBe("MATCHED");
    expect(props.selects[1].name).toBe("sort");
    expect(props.selects[1].value).toBe("diff_desc");

    const boundary = elements.find(
      (el) => el.type === Suspense && (el.key as string) === "MATCHED|booking-99|diff_desc|2",
    );
    expect(boundary).toBeDefined();
  });
});
