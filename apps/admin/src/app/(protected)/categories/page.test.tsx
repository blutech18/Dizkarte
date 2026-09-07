import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { listCategories } = vi.hoisted(() => ({
  listCategories: vi.fn((): Promise<any> => new Promise<never>(() => {})),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/guard", () => ({
  requirePageCapability: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Super Admin",
    email: "admin@dizkarte.test",
    capabilities: ["ADMIN_SUPER"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({ listCategories }),
}));

const { default: CategoriesPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("categories page streaming shell and filters", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      CategoriesPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listCategories).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await CategoriesPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("renders name, slug, badge, display order, task count, and Manage action", async () => {
    listCategories.mockResolvedValueOnce({
      items: [
        {
          id: "cat-cleaning",
          name: "Cleaning & Housekeeping",
          slug: "cleaning-housekeeping",
          active: true,
          displayOrder: 1,
          taskCount: 42,
          updatedAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await CategoriesPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "CategoriesTable",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Name link
    expect(html).toContain("Cleaning &amp; Housekeeping");
    expect(html).toContain('href="/categories/cat-cleaning"');
    // Slug code
    expect(html).toContain("cleaning-housekeeping");
    expect(html).toContain("dk-ref-code");
    // State badge
    expect(html).toContain("Active");
    // Order
    expect(html).toContain("#1");
    // Task count
    expect(html).toContain("42");
    // Datetime formatted
    expect(html).toContain("dk-datetime-cell");
    // Manage button
    expect(html).toContain("Manage");
  });

  it("renders dash fallback instead of epoch 1970 when updatedAt is epoch 0", async () => {
    listCategories.mockResolvedValueOnce({
      items: [
        {
          id: "cat-pet-care",
          name: "Pet Care",
          slug: "pet-care",
          active: true,
          displayOrder: 2,
          taskCount: 5,
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await CategoriesPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "CategoriesTable",
    );
    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    expect(html).not.toContain("1970");
    expect(html).toContain("—");
  });

  it("passes query, status, and sort filters to repository", async () => {
    listCategories.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await CategoriesPage({
      searchParams: Promise.resolve({
        q: "plumbing",
        status: "active",
        sort: "tasks",
      }),
    })) as ReactElement;

    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "CategoriesTable",
    );
    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);

    expect(listCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "plumbing",
        status: "active",
        sort: "tasks",
      }),
    );

    const html = renderToStaticMarkup(resolved);
    expect(html).toContain("No matching categories");
  });
});
