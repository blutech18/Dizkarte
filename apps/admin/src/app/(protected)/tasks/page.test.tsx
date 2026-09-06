import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { listTasks, listCategories } = vi.hoisted(() => ({
  listTasks: vi.fn((): Promise<any> => new Promise<never>(() => {})),
  listCategories: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 100, hasMore: false })),
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
  getAdminRepository: () => ({ listTasks, listCategories }),
}));

const { default: TasksPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("tasks page streaming shell", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      TasksPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await TasksPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("renders non-clickable task title, TSK formal reference, status, budget, city, compound datetime, and View action in table", async () => {
    listTasks.mockResolvedValueOnce({
      items: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Assemble IKEA Desk",
          status: "OPEN",
          budgetCentavos: 150_000,
          cityCode: "137404",
          categorySlug: "furniture-assembly",
          flagged: true,
          createdAt: "2026-08-15T10:30:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await TasksPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" && element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "TasksTable",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Non-clickable task title
    expect(html).toContain("Assemble IKEA Desk");
    expect(html).not.toMatch(/<a[^>]*>Assemble IKEA Desk<\/a>/);
    // Formal reference code
    expect(html).toContain("TSK-22222222");
    // Flagged badge
    expect(html).toContain("Flagged");
    // Status
    expect(html).toContain("Open for offers");
    // Budget formatted in PHP
    expect(html).toContain("1,500");
    // City code
    expect(html).toContain("137404");
    // Compound datetime (date and time in separate spans)
    expect(html).toContain("dk-datetime-cell");
    expect(html).toContain("dk-datetime-date");
    expect(html).toContain("dk-datetime-time");
    // Action view link button pointing to /tasks/${id}
    expect(html).toContain('href="/tasks/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("View");
  });
});
