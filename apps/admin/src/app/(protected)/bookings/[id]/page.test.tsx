import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The booking record's redesigned layout, asserted on the real rendered markup.
 *
 * The properties locked here are the ones a later edit could regress without
 * breaking a type or another test: one `h1` per page, exactly one current step,
 * every step's state also carried as text, and no raw database enum reaching the
 * screen.
 */

const booking = {
  id: "e167d9fa-9115-4e10-948c-1cb9e0cbcbb4",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskTitle: "Deep clean a two-bedroom condo",
  clientDisplayName: "Maria Santos",
  taskerDisplayName: "Jose Cruz",
  agreedCentavos: 250_000,
  currency: "PHP",
  status: "IN_PROGRESS",
  createdAt: "2026-08-20T02:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
  paymentIntentId: "33333333-3333-4333-8333-333333333333",
  paymentStatus: "PROTECTED",
  disputeId: null,
  timeline: [
    {
      id: "e1",
      fromStatus: null,
      toStatus: "PAYMENT_PENDING",
      actor: "system",
      source: "system",
      at: "2026-08-20T02:00:00.000Z",
    },
    {
      id: "e2",
      fromStatus: "PAYMENT_PENDING",
      toStatus: "CONFIRMED",
      actor: "system",
      source: "payments",
      at: "2026-08-21T02:00:00.000Z",
    },
    {
      id: "e3",
      fromStatus: "CONFIRMED",
      toStatus: "IN_PROGRESS",
      actor: "jose@dizkarte.test",
      source: "tasker",
      at: "2026-08-24T02:00:00.000Z",
    },
  ],
};

vi.mock("server-only", () => ({}));

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
  getAdminRepository: () => ({ getBooking: async () => booking }),
}));

const { default: BookingDetailPage } = await import("./page");

/** Every descendant element of a tree, depth-first. */
function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children)];
}

/**
 * Render the streamed record.
 *
 * The record is a suspended async child, so it is located in the shell and
 * invoked directly — the same thing the framework does when the boundary
 * resolves.
 */
async function renderRecord(): Promise<string> {
  const shell = await BookingDetailPage({
    params: Promise.resolve({ id: booking.id }),
  });

  const record = walk(shell).find(
    (element) =>
      typeof element.type === "function" && element.type.constructor.name === "AsyncFunction",
  );
  if (!record) throw new Error("the streamed record was not found in the shell");

  const resolved = await (record.type as (props: unknown) => Promise<ReactElement>)(record.props);
  return renderToStaticMarkup(resolved);
}

describe("booking record layout", () => {
  it("states the task once as the only page heading", async () => {
    const html = await renderRecord();

    expect(html.match(/<h1[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("Deep clean a two-bedroom condo");
  });

  it("names the status in plain language and never shows the raw enum", async () => {
    const html = await renderRecord();

    expect(html).toContain("In progress");
    expect(html).not.toContain("IN_PROGRESS");
    expect(html).not.toContain("PAYMENT_PENDING");
    expect(html).not.toContain("PROTECTED");
  });

  it("marks exactly one step as current", async () => {
    const html = await renderRecord();

    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("shows the steps already reached as done and the rest as not reached", async () => {
    const html = await renderRecord();

    // Paid and started; confirmation and completion still ahead.
    expect(html.match(/dk-flow-step-done/g)).toHaveLength(2);
    expect(html.match(/dk-flow-step-current/g)).toHaveLength(1);
    expect(html.match(/dk-flow-step-upcoming/g)).toHaveLength(2);
  });

  it("carries every step's state as text, so progress is not colour-only", async () => {
    const html = await renderRecord();

    expect(html.match(/Done<\/span>/g)).toHaveLength(2);
    expect(html).toContain("Current step");
    expect(html.match(/Not reached<\/span>/g)).toHaveLength(2);
  });

  it("gives the amount, both participants, and the time in state", async () => {
    const html = await renderRecord();

    expect(html).toContain("Maria Santos");
    expect(html).toContain("Jose Cruz");
    expect(html).toContain("Agreed amount");
    expect(html).toContain("In this state for");
    // The peso sign carries the currency; naming it again would be duplicate.
    expect(html).not.toContain("PHP");
  });

  it("links the payment and states plainly that there is no dispute", async () => {
    const html = await renderRecord();

    expect(html).toContain(`/payments/${booking.paymentIntentId}`);
    // The link reads as the money position, not the enum.
    expect(html).toContain("Held in protection");
    expect(html).toContain("None");
  });

  it("reports how long each recorded state lasted, newest first", async () => {
    const html = await renderRecord();

    // Newest event first: started 24 Aug, after 3 days held in Paid, not started.
    const started = html.indexOf("Paid, not started \u2192 In progress");
    const paid = html.indexOf("Awaiting payment \u2192 Paid, not started");
    expect(started).toBeGreaterThan(-1);
    expect(paid).toBeGreaterThan(started);
    expect(html).toContain("held 3 days");
    expect(html).toContain("held since");
    // Accountability reads as a phrase, not a machine token.
    expect(html).toContain("Tasker action");
    expect(html).toContain("Payment system");
    expect(html).not.toContain("payments ·");
  });
});



