import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { listBookings } = vi.hoisted(() => ({
  listBookings: vi.fn((): Promise<any> => new Promise<never>(() => {})),
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
  getAdminRepository: () => ({ listBookings }),
}));

const { default: BookingsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("bookings page streaming shell and filters", () => {
  it("resolves its shell without starting the results query", async () => {
    const shell = await Promise.race([
      BookingsPage({ searchParams: Promise.resolve({}) }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(listBookings).not.toHaveBeenCalled();
  });

  it("puts the results region behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await BookingsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const tableBoundary = boundaries.find((b) => (b.key as string)?.includes("|1"));
    expect(tableBoundary).toBeDefined();
    expect((tableBoundary as any).props.fallback).toBeTruthy();
  });

  it("renders task title, formal BK reference, participants, amount, status, datetime, and View action", async () => {
    listBookings.mockResolvedValueOnce({
      items: [
        {
          id: "e167d9fa-9115-4e10-948c-1cb9e0cbcbb4",
          taskId: "task-1",
          taskTitle: "Repaint a small bedroom",
          clientDisplayName: "Maria Santos",
          taskerDisplayName: "Jomar Villanueva",
          agreedCentavos: 350_000,
          status: "IN_PROGRESS",
          createdAt: "2026-08-29T16:27:00.000Z",
          updatedAt: "2026-08-29T16:30:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await BookingsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "BookingsTable",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    const html = renderToStaticMarkup(resolved);

    // Task title and formal reference
    expect(html).toContain("Repaint a small bedroom");
    expect(html).toContain("BK-20260830-E167");
    // Participants
    expect(html).toContain("Maria Santos");
    expect(html).toContain("Jomar Villanueva");
    // Agreed amount
    expect(html).toContain("3,500");
    // Status
    expect(html).toContain("In progress");
    // Datetime cell
    expect(html).toContain("dk-datetime-cell");
    // View action button
    expect(html).toContain('href="/bookings/e167d9fa-9115-4e10-948c-1cb9e0cbcbb4"');
    expect(html).toContain("View");
  });

  it("passes search query, status, and sort to repository", async () => {
    listBookings.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const shell = (await BookingsPage({
      searchParams: Promise.resolve({
        q: "Maria",
        status: "IN_PROGRESS",
        sort: "amount_high",
      }),
    })) as ReactElement;

    const tableElement = walk(shell).find(
      (element) =>
        typeof element.type === "function" &&
        element.type.constructor.name === "AsyncFunction" &&
        element.type.name === "BookingsTable",
    );
    expect(tableElement).toBeDefined();

    const resolved = await (tableElement!.type as (props: unknown) => Promise<ReactElement>)(tableElement!.props);
    expect(listBookings).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Maria",
        status: "IN_PROGRESS",
        sort: "amount_high",
      }),
    );

    const html = renderToStaticMarkup(resolved);
    expect(html).toContain("No matching bookings");
  });
});
