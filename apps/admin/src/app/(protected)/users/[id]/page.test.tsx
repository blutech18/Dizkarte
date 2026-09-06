import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockUser = {
  id: "edea3dcc-7b97-41d0-9fd0-92beb89424c8",
  displayName: "Cristan Jade",
  accountStatus: "active" as const,
  createdAt: "2026-08-12T11:02:00.000Z",
  language: "en",
  cityCode: null,
  verificationStatus: "SUBMITTED" as const,
  taskerApplicationStatus: null,
  taskCount: 2,
  bookingCountAsClient: 0,
  bookingCountAsTasker: 0,
  capabilities: [
    {
      capability: "CLIENT",
      grantedAt: "2026-08-12T11:02:00.000Z",
      revokedAt: null,
    },
  ],
  moderationHistory: [],
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
    getUser: async () => mockUser,
  }),
}));

const { default: UserDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

async function renderRecord(): Promise<string> {
  const shell = await UserDetailPage({
    params: Promise.resolve({ id: mockUser.id }),
  });

  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");

  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("user detail record layout", () => {
  it("renders the hero card with display name, avatar initials, and formal reference", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("Cristan Jade");
    expect(html).toContain("CJ");
    expect(html).toContain("USR-EDEA3DCC");
    expect(html).toContain("dk-booking-hero");
  });

  it("renders 2-column responsive layout and activity facts", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-booking-grid");
    expect(html).toContain("dk-booking-col");
    expect(html).toContain("Marketplace Activity");
    expect(html).toContain("Capability History");
    expect(html).toContain("Moderation History &amp; Audit Trail");
  });

  it("renders account actions, standing & trust, and account references", async () => {
    const html = await renderRecord();

    expect(html).toContain("Account Actions");
    expect(html).toContain("Standing &amp; Trust");
    expect(html).toContain("Account References");
    expect(html).toContain("User Reference");
    expect(html).toContain("User ID");
  });
});
