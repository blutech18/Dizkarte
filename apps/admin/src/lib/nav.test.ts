import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isNavItemVisible, NAV_SECTIONS } from "./nav";

describe("isNavItemVisible", () => {
  it("shows items with no capability requirement to everyone", () => {
    expect(isNavItemVisible({ href: "/dashboard", label: "Dashboard" }, [])).toBe(true);
  });

  it("hides capability-gated items from users without the capability", () => {
    const item = { href: "/payments", label: "Payments", capabilities: ["ADMIN_FINANCE" as const] };
    expect(isNavItemVisible(item, ["ADMIN_SUPPORT"])).toBe(false);
  });

  it("shows capability-gated items to users with the matching capability", () => {
    const item = { href: "/payments", label: "Payments", capabilities: ["ADMIN_FINANCE" as const] };
    expect(isNavItemVisible(item, ["ADMIN_FINANCE"])).toBe(true);
  });

  it("always shows capability-gated items to ADMIN_SUPER", () => {
    const item = { href: "/payments", label: "Payments", capabilities: ["ADMIN_FINANCE" as const] };
    expect(isNavItemVisible(item, ["ADMIN_SUPER"])).toBe(true);
  });

  it("defines at least one nav section with items", () => {
    expect(NAV_SECTIONS.length).toBeGreaterThan(0);
    for (const section of NAV_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("every nav link points at a route that exists", () => {
    // A sidebar entry leading to a 404 is the worst kind of broken: it looks like
    // a feature. Checked structurally so adding a nav item without its page fails
    // here rather than in someone's browser.
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        const segment = item.href.replace(/^\//, "");
        const page = resolve(
          dirname(fileURLToPath(import.meta.url)),
          "..",
          "app",
          "(protected)",
          segment,
          "page.tsx",
        );
        expect(existsSync(page), `${item.href} has no page.tsx`).toBe(true);
      }
    }
  });

  it("has no duplicate destinations", () => {
    // Two entries pointing at the same route means the user has to guess which
    // one is the "real" one.
    const hrefs = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
