import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { listTaskMedia, getMediaPreviewUrl } = vi.hoisted(() => ({
  listTaskMedia: vi.fn((): Promise<any> => new Promise<never>(() => {})),
  getMediaPreviewUrl: vi.fn(async () => "https://storage.test/signed-preview.jpg"),
}));

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
  getAdminRepository: () => ({ listTaskMedia, getMediaPreviewUrl }),
}));

const { default: MediaPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("task media page streaming shell & formal card design", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      MediaPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listTaskMedia).not.toHaveBeenCalled();
  });

  it("puts the gallery region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await MediaPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const galleryBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(galleryBoundary).toBeDefined();
    expect((galleryBoundary as any).props.fallback).toBeTruthy();
  });

  it("renders formal card design: preview, kind badge, status, compound datetime, non-clickable title, TSK/MED ref codes, View task link, and moderation actions", async () => {
    listTaskMedia.mockResolvedValueOnce({
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          taskId: "22222222-2222-4222-8222-222222222222",
          taskTitle: "Fix leaking pipe under kitchen sink",
          kind: "image",
          storagePath: "tasks/22222222/media/photo.jpg",
          moderationStatus: "PENDING",
          createdAt: "2026-08-20T14:45:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      hasMore: false,
    });

    const shell = (await MediaPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const galleryElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "MediaGallery",
    );
    expect(galleryElement).toBeDefined();

    const resolved = await (galleryElement!.type as (props: unknown) => Promise<ReactElement>)(galleryElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Card structure
    expect(html).toContain("dk-media-card");
    expect(html).toContain("dk-media-preview-container");
    expect(html).toContain("dk-media-kind-badge");
    expect(html).toContain("Image");

    // Signed preview image
    expect(html).toContain("https://storage.test/signed-preview.jpg");

    // Status badge
    expect(html).toContain("Needs review");

    // Compound datetime in single row and number form (media queue specific)
    expect(html).toContain("dk-datetime-cell");
    expect(html).toContain("dk-media-datetime");
    expect(html).toContain("dk-datetime-date");
    expect(html).toContain("2026-08-20");
    expect(html).toContain("dk-datetime-time");
    expect(html).toContain("22:45");

    // Non-clickable bold task title (not wrapped in an anchor)
    expect(html).toContain("Fix leaking pipe under kitchen sink");
    expect(html).not.toMatch(/<a[^>]*>Fix leaking pipe under kitchen sink<\/a>/);

    // Formal reference codes
    expect(html).toContain("TSK-22222222");
    expect(html).toContain("MED-33333333");

    // Action footer: View task link button
    expect(html).toContain("href=\"/tasks/22222222-2222-4222-8222-222222222222\"");
    expect(html).toContain("View task");

    // Moderation action buttons
    expect(html).toContain("Approve");
    expect(html).toContain("Hide");
  });
});
