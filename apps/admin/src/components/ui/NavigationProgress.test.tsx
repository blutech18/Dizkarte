import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  NavigationProgressBar,
  NavigationProgressProvider,
  useNavigationProgress,
} from "./NavigationProgress";

/**
 * Stands in for the reporter inside `AppLink`, which can only read
 * `useLinkStatus` from within a real `<Link>`. The contract under test is the
 * shell's: what it shows once a link says it is (or is no longer) navigating.
 */
function Reporter({ id }: { readonly id: string }) {
  const { reportPending } = useNavigationProgress();
  return (
    <>
      <button type="button" onClick={() => reportPending(id, true)}>{`start ${id}`}</button>
      <button type="button" onClick={() => reportPending(id, false)}>{`settle ${id}`}</button>
    </>
  );
}

function shell(pathname: string) {
  return (
    <NavigationProgressProvider pathname={pathname}>
      <Reporter id="/users" />
      <Reporter id="/payments" />
      <NavigationProgressBar />
    </NavigationProgressProvider>
  );
}

function click(label: string) {
  act(() => {
    screen.getByRole("button", { name: label }).click();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function bar() {
  return screen.queryByTestId("nav-progress");
}

/** Comfortably past the reveal delay and the minimum visible window. */
const PAST_ALL_THRESHOLDS = 1000;

afterEach(() => {
  vi.useRealTimers();
});

describe("navigation progress", () => {
  it("shows nothing while idle", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));
    advance(PAST_ALL_THRESHOLDS);
    expect(bar()).not.toBeInTheDocument();
  });

  it("does not flash for a navigation that resolves quickly", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    advance(100);
    // Still inside the reveal delay: nothing has been shown.
    expect(bar()).not.toBeInTheDocument();

    click("settle /users");
    advance(PAST_ALL_THRESHOLDS);
    expect(bar()).not.toBeInTheDocument();
  });

  it("reveals the bar once the navigation outlasts the delay", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    advance(250);
    expect(bar()).toBeInTheDocument();
  });

  it("holds the bar for a minimum duration once revealed", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    advance(250);
    expect(bar()).toBeInTheDocument();

    // Settling immediately after the reveal must not produce a one-frame flash.
    click("settle /users");
    advance(100);
    expect(bar()).toBeInTheDocument();

    advance(PAST_ALL_THRESHOLDS);
    expect(bar()).not.toBeInTheDocument();
  });

  it("shows a single bar even when two links report at once", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    click("start /payments");
    advance(250);
    expect(screen.getAllByTestId("nav-progress")).toHaveLength(1);
  });

  it("does not let an unrelated link settling hide a live bar", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    advance(250);
    click("settle /payments");
    advance(PAST_ALL_THRESHOLDS);
    expect(bar()).toBeInTheDocument();
  });

  it("clears on arrival, so a link that never settles cannot strand the bar", () => {
    vi.useFakeTimers();
    const { rerender } = render(shell("/dashboard"));

    click("start /users");
    advance(250);
    expect(bar()).toBeInTheDocument();

    act(() => {
      rerender(shell("/users"));
    });
    advance(PAST_ALL_THRESHOLDS);
    expect(bar()).not.toBeInTheDocument();
  });

  it("carries no accessible content of its own", () => {
    vi.useFakeTimers();
    render(shell("/dashboard"));

    click("start /users");
    advance(250);
    // The content region is marked aria-busy instead; the bar is decoration.
    expect(bar()).toHaveAttribute("aria-hidden", "true");
  });
});
