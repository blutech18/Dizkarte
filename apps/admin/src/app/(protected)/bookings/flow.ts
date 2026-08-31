/**
 * Where a booking sits in the money path.
 *
 * The status label alone says what the booking *is*; on an escalation the agent
 * also needs to know what it has already been through — whether funds were ever
 * held, whether the Tasker ever started. That is answered by the recorded
 * timeline, not by the current status, so progress is derived from the events
 * rather than assumed from the enum.
 */

/** The path a booking follows when nothing goes wrong, in order. */
export const BOOKING_FLOW: ReadonlyArray<string> = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
];

export type FlowStepState = "done" | "current" | "upcoming";

export type FlowStep = {
  readonly status: string;
  readonly state: FlowStepState;
};

/**
 * The flow annotated with what this booking has actually reached.
 *
 * A status outside the happy path (cancelled, refunded, payment failed, in
 * dispute) is appended as a final step instead of being forced into the line:
 * a cancelled booking has not "progressed to" cancellation past the steps it
 * never took, and showing it inline would imply the ones before it completed.
 *
 * Steps before the current one are treated as done even when the timeline is
 * empty, because the path is strictly ordered — work cannot be in progress
 * without payment having been held first. That inference is only applied to the
 * ordered path, never to an off-path outcome.
 */
export function bookingFlowSteps(
  status: string,
  timeline: ReadonlyArray<{ readonly toStatus: string }>,
): ReadonlyArray<FlowStep> {
  const reached = new Set(timeline.map((event) => event.toStatus));
  const currentIndex = BOOKING_FLOW.indexOf(status);

  const steps: FlowStep[] = BOOKING_FLOW.map((step, index) => {
    if (step === status) return { status: step, state: "current" };
    const passed = reached.has(step) || (currentIndex !== -1 && index < currentIndex);
    return { status: step, state: passed ? "done" : "upcoming" };
  });

  if (currentIndex === -1) steps.push({ status, state: "current" });
  return steps;
}

/** Text alternative for a step's state, so progress is never colour-only. */
export function flowStateDescription(state: FlowStepState): string {
  switch (state) {
    case "done":
      return "Done";
    case "current":
      return "Current step";
    default:
      return "Not reached";
  }
}
