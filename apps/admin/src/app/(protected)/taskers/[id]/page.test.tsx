import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockApplication = {
  id: "8a00a1fb-e4cb-4b45-813a-b3640c56ffd1",
  userId: "edea3dcc-7b97-41d0-9fd0-92beb89424c8",
  userDisplayName: "R. Bautista",
  status: "SUBMITTED" as const,
  specialties: ["Home cleaning", "Laundry"],
  submittedAt: "2026-07-19T01:00:00.000Z",
  bio: "Detail-oriented home cleaner with 3 years of experience serving Quezon City households.",
  experience: "3 years freelance home cleaning, previously with a local cleaning cooperative.",
  serviceAreas: ["Quezon City", "San Juan"],
  portfolioCount: 4,
  payoutTokenBoundaryLabel: "GCash token on file (masked)",
};

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(),
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
    getTaskerApplication: async () => mockApplication,
  }),
}));

const { default: TaskerApplicationDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

async function renderRecord(): Promise<string> {
  const shell = await TaskerApplicationDetailPage({
    params: Promise.resolve({ id: mockApplication.id }),
  });

  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");

  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("tasker application detail record layout", () => {
  it("renders the hero card with applicant name, avatar initials, and formal references", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("R. Bautista");
    expect(html).toContain("RB");
    expect(html).toContain("USR-EDEA3DCC");
    expect(html).toContain("TAP-20260719-8A00");
    expect(html).toContain("dk-booking-hero");
  });

  it("renders hero metrics including submission time, waiting status, portfolio count, and completeness", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-booking-metrics");
    expect(html).toContain("Submitted");
    expect(html).toContain("Review Status");
    expect(html).toContain("Waiting");
    expect(html).toContain("Portfolio Evidence");
    expect(html).toContain("4");
    expect(html).toContain("Completeness");
    expect(html).toContain("5 of 5 provided");
  });

  it("renders 2-column responsive layout and applicant cards", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-booking-grid");
    expect(html).toContain("dk-booking-col");
    expect(html).toContain("About the Applicant");
    expect(html).toContain("Bio Statement");
    expect(html).toContain(mockApplication.bio);
    expect(html).toContain("Professional Experience");
    expect(html).toContain(mockApplication.experience);
    expect(html).toContain("Services &amp; Coverage");
    expect(html).toContain("Home cleaning");
    expect(html).toContain("Laundry");
    expect(html).toContain("Quezon City");
    expect(html).toContain("San Juan");
    expect(html).toContain("Application Completeness");
  });

  it("renders decision controls, financial privacy boundary, and application references", async () => {
    const html = await renderRecord();

    expect(html).toContain("Make a Decision");
    expect(html).toContain("Payout Method");
    expect(html).toContain("Financial Privacy Boundary");
    expect(html).toContain("GCash token on file (masked)");
    expect(html).toContain("Application References");
    expect(html).toContain("Application ID");
    expect(html).toContain(mockApplication.id);
    expect(html).toContain("Applicant Reference");
    expect(html).toContain("User ID");
    expect(html).toContain(mockApplication.userId);
  });
});
