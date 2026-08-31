import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as NextNavigation from "next/navigation";

/**
 * The task record's rendered markup.
 *
 * Locks the properties a later edit could regress silently: one `h1`, plain
 * language instead of raw enums, the reciprocal link back to the media queue,
 * and — the one that matters for privacy — that nothing on this page can expose
 * a storage path or an exact address.
 */

const task = {
  id: "tsk-2003",
  title: "Deep clean 2BR condo unit",
  description: "Two bedrooms, one bathroom, kitchen included. Please bring your own supplies.",
  status: "OPEN",
  budgetCentavos: 250_000,
  currency: "PHP",
  clientDisplayName: "Maria Santos",
  cityCode: "137404",
  barangayCode: "137404001",
  landmark: "Near the barangay hall",
  categorySlug: "home-cleaning",
  scheduledFor: "2026-09-04T02:00:00.000Z",
  sameDay: false,
  publishedAt: "2026-08-30T02:00:00.000Z",
  flagged: true,
  createdAt: "2026-08-29T02:00:00.000Z",
  updatedAt: "2026-08-30T02:00:00.000Z",
  bookingId: "bkg-6001",
  attachments: [
    {
      id: "tmd-7001",
      kind: "image" as const,
      moderationStatus: "PENDING" as const,
      createdAt: "2026-08-29T02:15:00.000Z",
    },
    {
      id: "tmd-7002",
      kind: "video" as const,
      moderationStatus: "HIDDEN" as const,
      createdAt: "2026-08-29T02:16:00.000Z",
    },
  ],
  moderationHistory: [
    {
      id: "mod-1",
      action: "remove",
      reason: "Duplicate posting of the same job.",
      actor: "support@dizkarte.test",
      at: "2026-08-30T01:00:00.000Z",
    },
  ],
};

vi.mock("server-only", () => ({}));

// The Discovery card renders the existing client-side action component, which
// calls `useRouter`. Only that hook is stubbed — `notFound` is still the real
// implementation, because the page depends on it for a missing task.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  useRouter: () => ({ refresh: () => {} }),
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
  getAdminRepository: () => ({ getTask: async () => task }),
}));

const { default: TaskDetailPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

/** Render the streamed record the way the framework does when it resolves. */
async function renderRecord(): Promise<string> {
  const shell = await TaskDetailPage({ params: Promise.resolve({ id: task.id }) });
  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");
  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("task record layout", () => {
  it("states the task title once as the only page heading", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("Deep clean 2BR condo unit");
  });

  it("names the status in plain language, never the raw enum", async () => {
    const html = await renderRecord();

    expect(html).toContain("Open for offers");
    expect(html).not.toContain("OPEN<");
    expect(html).toContain("Published and visible in public discovery");
  });

  it("shows the client's own words as a quote", async () => {
    const html = await renderRecord();

    expect(html).toContain("dk-quote");
    expect(html).toContain("Please bring your own supplies.");
  });

  it("reports an open abuse report as a fact, not a second status badge", async () => {
    const html = await renderRecord();

    expect(html).toContain("Abuse reports");
    expect(html).toContain("Open report on this task");
  });

  it("lists each attachment with a plain-language moderation state", async () => {
    const html = await renderRecord();

    expect(html).toContain("Photo");
    expect(html).toContain("Video clip");
    expect(html).not.toContain("PENDING");
    expect(html).not.toContain("HIDDEN");
  });

  it("never exposes a storage path or an exact address", async () => {
    const html = await renderRecord();

    // Attachments deliberately carry no storage path into this page.
    expect(html).not.toContain(".jpg");
    expect(html).not.toContain(".mp4");
    expect(html).not.toContain("storage");
    // The locality is stated as approximate.
    expect(html).toContain("approximate public area, not the exact address");
  });

  it("links onward to the booking and back to the media queue", async () => {
    const html = await renderRecord();

    expect(html).toContain("/bookings/bkg-6001");
    expect(html).toContain("/media?status=all&amp;q=");
  });

  it("shows a recorded decision with the reason it was given", async () => {
    const html = await renderRecord();

    expect(html).toContain("Duplicate posting of the same job.");
    expect(html).toContain("support@dizkarte.test");
  });
});

