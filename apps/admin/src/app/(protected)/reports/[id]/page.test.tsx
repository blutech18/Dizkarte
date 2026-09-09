import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const report = {
  id: "fc4fd239-a274-43b6-8685-9605594544da",
  reporterId: "user-1",
  reporterDisplayName: "Maria Santos",
  resourceType: "task",
  resourceId: "task-101",
  category: "spam",
  reason: "Inappropriate task posting content",
  status: "OPEN",
  assignee: null,
  access: { restricted: false },
  subject: null,
  caseSubject: {
    resourceLabel: "Task: Clean 2-bedroom unit",
    resourceType: "task",
    resourceId: "task-101",
  },
  narrative: "User posted inappropriate content.",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  evidence: [],
  history: [],
};

const { getReport } = vi.hoisted(() => ({
  getReport: vi.fn(async () => report),
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
    displayName: "Support Admin",
    email: "support@dizkarte.test",
    capabilities: ["ADMIN_SUPPORT"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({ getReport }),
}));

const { default: ReportDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("report detail page", () => {
  it("renders breadcrumbs and puts record behind Suspense boundary", async () => {
    const shell = (await ReportDetailPage({
      params: Promise.resolve({ id: report.id }),
    })) as ReactElement;

    const boundaries = walk(shell).filter((element) => element.type === Suspense);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as any).props.fallback).toBeTruthy();
  });

  it("renders report record and assigns actions panel with pure serializable props", async () => {
    const shell = (await ReportDetailPage({
      params: Promise.resolve({ id: report.id }),
    })) as ReactElement;

    const recordElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "ReportCaseRecord",
    );
    expect(recordElement).toBeDefined();

    const resolved = await (recordElement!.type as (props: unknown) => Promise<ReactElement>)(recordElement!.props);
    const html = renderToStaticMarkup(resolved);

    expect(html).toContain("Task report · spam");
    expect(html).toContain("Maria Santos");
    expect(html).toContain("fc4fd239-a274-43b6-8685-9605594544da");
    expect(html).toContain("Assign to me");
  });

  it("renders the unified privacy lock banner when case is unassigned and restricted", async () => {
    getReport.mockResolvedValueOnce({
      ...report,
      reporterDisplayName: "(protected)",
      access: { restricted: true, reason: "unassigned" },
      assignee: null,
      narrative: null,
      subject: null,
    } as any);

    const shell = (await ReportDetailPage({
      params: Promise.resolve({ id: report.id }),
    })) as ReactElement;

    const recordElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "ReportCaseRecord",
    );
    expect(recordElement).toBeDefined();

    const resolved = await (recordElement!.type as (props: unknown) => Promise<ReactElement>)(
      recordElement!.props,
    );
    const html = renderToStaticMarkup(resolved);

    expect(html).toContain("Case Assignment Required");
    expect(html).toContain("Protected Information in this Case");
    expect(html).toContain("Assign to me");
  });
});

