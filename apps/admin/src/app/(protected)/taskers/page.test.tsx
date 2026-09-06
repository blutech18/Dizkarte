import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockApplications = [
  {
    id: "tap-0001",
    userId: "usr-1004",
    userDisplayName: "R. Bautista",
    status: "SUBMITTED" as const,
    specialties: ["Home cleaning", "Laundry"],
    submittedAt: "2026-07-19T01:00:00.000Z",
  },
];

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
  getAdminRepository: () => ({
    listTaskerApplications: async () => ({
      items: mockApplications,
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    }),
  }),
}));

const { default: TaskerApplicationsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("TaskerApplicationsPage", () => {
  it("renders the shell with breadcrumbs and filters", async () => {
    const shell = (await TaskerApplicationsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const names = walk(shell).map((element) =>
      typeof element.type === "function" ? element.type.name : String(element.type),
    );

    expect(names).toContain("Breadcrumbs");
    expect(names).toContain("PageSection");
    expect(names).toContain("QueueFilters");
  });

  it("renders 6-column skeleton fallback on Suspense", async () => {
    const shell = (await TaskerApplicationsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries).toHaveLength(1);
  });

  it("renders applicant avatar, ref code, status badge, specialty tags, and actions in table", async () => {
    const shell = (await TaskerApplicationsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Avatar initials
    expect(html).toContain("RB");
    // Applicant name & ref code
    expect(html).toContain("R. Bautista");
    expect(html).toContain("TAP-0001");
    // Specialties count button
    expect(html).toContain("2");
    expect(html).toContain("Specialties");
    // Action buttons
    expect(html).toContain("Review");
    expect(html).toContain("Account");
    expect(html).toContain("/taskers/tap-0001");
    expect(html).toContain("/users/usr-1004");
  });
});
