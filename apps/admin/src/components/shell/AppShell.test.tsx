import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("server-only", () => ({}));

let currentPathname = "/taskers";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import type { AdminSession } from "@/lib/session";
import { AppShell } from "./AppShell";

const mockSession: AdminSession = {
  userId: "admin-1",
  displayName: "Admin Operator",
  email: "admin@dizkarte.ph",
  capabilities: ["ADMIN_SUPPORT"],
  synthetic: false,
};

describe("AppShell scroll to top behavior", () => {
  beforeEach(() => {
    currentPathname = "/taskers";
    window.scrollTo = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  it("resets scrollTop of main content when navigating or clicking internal link", () => {
    // Suppress jsdom's "not implemented: navigation" notice
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender, container } = render(
      <AppShell session={mockSession} devMode={false} syntheticData={false}>
        <div data-testid="page-1">
          <a href="/taskers/8a00a1fb" data-testid="view-btn">
            View
          </a>
        </div>
      </AppShell>
    );

    const main = container.querySelector("#dk-main-content") as HTMLElement;
    expect(main).toBeDefined();

    // Simulate operator scrolling down the table
    Object.defineProperty(main, "scrollTop", {
      writable: true,
      value: 650,
    });
    expect(main.scrollTop).toBe(650);

    // Clicking an internal View link immediately triggers scrollToTop
    const viewLink = screen.getByTestId("view-btn");
    fireEvent.click(viewLink);
    expect(main.scrollTop).toBe(0);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    // Now simulate the new page rendering
    currentPathname = "/taskers/8a00a1fb";
    main.scrollTop = 400; // pretend scroll remained
    rerender(
      <AppShell session={mockSession} devMode={false} syntheticData={false}>
        <div data-testid="page-2">Tasker details</div>
      </AppShell>
    );

    expect(main.scrollTop).toBe(0);
    consoleError.mockRestore();
  });

  it("handles popstate (browser back/forward) by scrolling to top", () => {
    const { container } = render(
      <AppShell session={mockSession} devMode={false} syntheticData={false}>
        <div>Page content</div>
      </AppShell>
    );

    const main = container.querySelector("#dk-main-content") as HTMLElement;
    Object.defineProperty(main, "scrollTop", {
      writable: true,
      value: 300,
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(main.scrollTop).toBe(0);
  });
});
