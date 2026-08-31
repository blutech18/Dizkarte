import { describe, expect, it } from "vitest";
import { BOOKING_FLOW, bookingFlowSteps, flowStateDescription } from "./flow";

function events(...statuses: ReadonlyArray<string>) {
  return statuses.map((toStatus) => ({ toStatus }));
}

describe("bookingFlowSteps", () => {
  it("marks the current status and treats the ordered steps before it as done", () => {
    const steps = bookingFlowSteps("IN_PROGRESS", events("PAYMENT_PENDING", "CONFIRMED"));

    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("infers the earlier steps even when no timeline event was recorded", () => {
    const steps = bookingFlowSteps("COMPLETION_REQUESTED", []);

    expect(steps.slice(0, 3).every((step) => step.state === "done")).toBe(true);
    expect(steps[3]?.state).toBe("current");
  });

  it("keeps every step of a finished booking accounted for", () => {
    const steps = bookingFlowSteps("COMPLETED", []);

    expect(steps).toHaveLength(BOOKING_FLOW.length);
    expect(steps.at(-1)?.state).toBe("current");
    expect(steps.slice(0, -1).every((step) => step.state === "done")).toBe(true);
  });

  it("appends an off-path outcome instead of placing it in the line", () => {
    const steps = bookingFlowSteps("CANCELLED", events("PAYMENT_PENDING"));

    expect(steps).toHaveLength(BOOKING_FLOW.length + 1);
    expect(steps.at(-1)).toEqual({ status: "CANCELLED", state: "current" });
  });

  it("does not imply progress a cancelled booking never made", () => {
    const steps = bookingFlowSteps("CANCELLED", events("PAYMENT_PENDING"));

    // Payment was reached; nothing after it was.
    expect(steps[0]?.state).toBe("done");
    expect(steps.slice(1, BOOKING_FLOW.length).every((step) => step.state === "upcoming")).toBe(
      true,
    );
  });

  it("credits steps a disputed booking did reach", () => {
    const steps = bookingFlowSteps(
      "DISPUTED",
      events("PAYMENT_PENDING", "CONFIRMED", "IN_PROGRESS"),
    );

    expect(steps.slice(0, 3).every((step) => step.state === "done")).toBe(true);
    expect(steps.at(-1)?.status).toBe("DISPUTED");
  });

  it("exposes exactly one current step", () => {
    for (const status of [...BOOKING_FLOW, "REFUNDED", "PAYMENT_FAILED"]) {
      const steps = bookingFlowSteps(status, []);
      expect(steps.filter((step) => step.state === "current")).toHaveLength(1);
    }
  });
});

describe("flowStateDescription", () => {
  it("gives every state a text alternative so progress is not colour-only", () => {
    expect(flowStateDescription("done")).toBe("Done");
    expect(flowStateDescription("current")).toBe("Current step");
    expect(flowStateDescription("upcoming")).toBe("Not reached");
  });
});
