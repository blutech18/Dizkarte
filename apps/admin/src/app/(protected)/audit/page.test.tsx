import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { listAuditLogs } = vi.hoisted(() => ({
  listAuditLogs: vi.fn((): Promise<any> => new Promise<never>(() => {})),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/guard", () => ({
  requirePageCapability: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Super Admin",
    email: "super@dizkarte.test",
    capabilities: ["ADMIN_SUPER"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({
    listAuditLogs,
  }),
}));

const { default: AuditLogPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("audit log page streaming shell and filters", () => {
  it("resolves its shell immediately without awaiting row listings", async () => {
    const shell = await Promise.race([
      AuditLogPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listAuditLogs).not.toHaveBeenCalled();
  });

  it("puts the row listing behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await AuditLogPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("binds search, action, and sort criteria to QueueFilters and Suspense key", async () => {
    const shell = (await AuditLogPage({
      searchParams: Promise.resolve({
        action: "verification.decide",
        q: "blurry",
        sort: "oldest",
        page: "2",
      }),
    })) as ReactElement;

    const elements = walk(shell);
    const filtersElement = elements.find((el) => (el.props as any)?.basePath === "/audit");
    expect(filtersElement).toBeDefined();

    const props = (filtersElement as any).props;
    expect(props.search).toEqual({
      label: "Search audit log by actor, action, resource, or reason",
      placeholder: "Search actor, action, resource, reason...",
      value: "blurry",
    });

    expect(props.selects).toHaveLength(2);
    expect(props.selects[0].name).toBe("action");
    expect(props.selects[0].value).toBe("verification.decide");
    expect(props.selects[1].name).toBe("sort");
    expect(props.selects[1].value).toBe("oldest");

    const boundary = elements.find(
      (el) =>
        el.type === Suspense &&
        (el.key as string) === "verification.decide|blurry|oldest|2",
    );
    expect(boundary).toBeDefined();
  });
});
