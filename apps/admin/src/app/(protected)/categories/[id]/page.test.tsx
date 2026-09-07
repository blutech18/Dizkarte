import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const category = {
  id: "851e50ab-f316-44d1-a6b6-e783dbf76a7b",
  name: "Cleaning & Housekeeping",
  slug: "cleaning-housekeeping",
  active: true,
  displayOrder: 1,
  taskCount: 15,
  updatedAt: "1970-01-01T00:00:00.000Z",
  history: [],
};

const { getCategory } = vi.hoisted(() => ({
  getCategory: vi.fn(async () => category),
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
    displayName: "Super Admin",
    email: "admin@dizkarte.test",
    capabilities: ["ADMIN_SUPER"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({ getCategory }),
}));

const { default: CategoryDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("category detail page", () => {
  it("renders breadcrumbs and puts record behind Suspense boundary", async () => {
    const shell = (await CategoryDetailPage({
      params: Promise.resolve({ id: category.id }),
    })) as ReactElement;

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });

  it("renders category details and falls back to Initial catalog when updatedAt is epoch 0", async () => {
    const shell = (await CategoryDetailPage({
      params: Promise.resolve({ id: category.id }),
    })) as ReactElement;

    const recordElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "CategoryRecord",
    );
    expect(recordElement).toBeDefined();

    const resolved = await (recordElement!.type as (props: unknown) => Promise<ReactElement>)(recordElement!.props);
    const html = renderToStaticMarkup(resolved);

    expect(html).toContain("Cleaning &amp; Housekeeping");
    expect(html).toContain("cleaning-housekeeping");
    expect(html).toContain("Active");
    expect(html).toContain("Initial catalog");
    expect(html).not.toContain("1970");
  });
});
