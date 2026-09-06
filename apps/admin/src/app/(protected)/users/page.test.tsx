import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The point of the streaming refactor is a property that is easy to regress
 * silently: the page component must return its shell WITHOUT waiting for any
 * repository read. A future edit that pulls an `await repository.*` back up into
 * the page would still typecheck, still render, and still pass every other test
 * — it would only be slower. So this asserts the property directly.
 *
 * The repository is stubbed with a promise that never settles. If the page awaits
 * it, the page never resolves and this test fails on its own deadline.
 */

const { listUsers } = vi.hoisted(() => ({
  listUsers: vi.fn((): Promise<any> => new Promise<never>(() => {})),
}));

// `server-only` throws on import outside a server component; the modules under
// test are server components, so it is stubbed exactly as the other Admin
// server-side tests do.
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
  getAdminRepository: () => ({ listUsers }),
}));

const { default: UsersPage } = await import("./page");

/** Every descendant element of a tree, depth-first. */
function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("users page streaming shell", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      UsersPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    // Not merely "resolved fast" — the query has not even been issued from the
    // page, because it belongs to the suspended child.
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await UsersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries).toHaveLength(1);
    const boundary = boundaries[0] as ReactElement<{ fallback?: unknown; children?: unknown }>;
    expect(boundary.props.fallback).toBeTruthy();
    // Keyed by the applied filters, so changing a filter re-shows the skeleton
    // instead of leaving the previous result set on screen.
    expect(boundary.key).toBe("|" + "|" + "1");
  });

  it("renders the heading and filter controls in the shell, not behind the boundary", async () => {
    const shell = (await UsersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const names = walk(shell).map((element) =>
      typeof element.type === "function" ? element.type.name : String(element.type),
    );

    // Breadcrumbs, the page header, and the filter row are all reachable without
    // resolving the suspended child.
    expect(names).toContain("Breadcrumbs");
    expect(names).toContain("PageSection");
    expect(names).toContain("QueueFilters");
  });

  it("renders user avatar initials, formal USR ref, role badges, verification status, joined date, and actions in table", async () => {
    listUsers.mockResolvedValueOnce({
      items: [
        {
          id: "edea3dcc-7b97-41d0-9fd0-92beb89424c8",
          displayName: "Cristan Jade",
          email: "cristan@example.test",
          accountStatus: "active" as const,
          identityVerified: true,
          createdAt: "2026-08-12T11:02:00.000Z",
          roles: ["CLIENT", "TASKER"],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await UsersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Avatar initials
    expect(html).toContain("CJ");
    // Display name & formal USR reference (display name is non-clickable span)
    expect(html).toContain('<span class="dk-user-name">Cristan Jade</span>');
    expect(html).not.toMatch(/<a[^>]*>Cristan Jade<\/a>/);
    expect(html).toContain("USR-EDEA3DCC");
    // Role badges (Client has dedicated client tone, Tasker has info tone)
    expect(html).toContain("Client");
    expect(html).toContain("dk-badge-client");
    expect(html).toContain("Tasker");
    expect(html).toContain("dk-badge-info");
    // Verification & Account status
    expect(html).toContain("Verified");
    expect(html).toContain("Active");
    // Action buttons
    expect(html).toContain("Profile");
    expect(html).toContain("Suspend");
    expect(html).toContain("Ban");
    expect(html).toContain("/users/edea3dcc-7b97-41d0-9fd0-92beb89424c8");
  });
});
