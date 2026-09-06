import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const verificationCase = {
  id: "61654e62-0070-44dd-aa7a-b018e8fa6e70",
  userId: "99999999-9999-4999-8999-999999999999",
  userDisplayName: "Maria Clara",
  status: "SUBMITTED" as const,
  submittedAt: "2026-08-25T08:30:00.000Z",
  documentCount: 2,
  assignedAdminName: "Juan Dela Cruz",
  history: [
    {
      at: "2026-08-25T08:30:00.000Z",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actor: "Maria Clara",
      reason: null,
    },
  ],
  documents: [
    {
      kind: "primary_id",
      signedUrlPreview: "primary_id (image/jpeg) — authorized on request",
    },
    {
      kind: "selfie",
      signedUrlPreview: "selfie (image/png) — authorized on request",
    },
  ],
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
    getVerificationCase: async () => verificationCase,
  }),
}));

const { default: VerificationDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

async function renderRecord(): Promise<string> {
  const shell = await VerificationDetailPage({
    params: Promise.resolve({ id: verificationCase.id }),
  });

  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");

  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("verification detail record layout", () => {
  it("renders a single h1 with applicant display name and formal reference", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("Maria Clara");
    expect(html).toContain("USR-99999999");
  });

  it("renders the hero card and 2-column grid layout", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-booking-hero");
    expect(html).toContain("dk-booking-grid");
    expect(html).toContain("dk-booking-col");
  });

  it("presents submitted documents and manual verification notice", async () => {
    const html = await renderRecord();

    expect(html).toContain("Submitted Documents");
    expect(html).toContain("Primary Id");
    expect(html).toContain("Selfie");
    expect(html).toContain("Manual Document Review");
  });

  it("includes decision panel, review context, and case history with formal references", async () => {
    const html = await renderRecord();

    expect(html).toContain("Make a Decision");
    expect(html).toContain("Review Context");
    expect(html).toContain("Case Reference");
    expect(html).toContain("Applicant Reference");
    expect(html).toContain("VER-20260825-6165");
    expect(html).toContain("USR-99999999");
    expect(html).toContain("Case History &amp; Audit Trail");
  });
});
