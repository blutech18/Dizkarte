import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS, hasAnyCapability, isNavItemVisible, NAV_SECTIONS } from "./nav";

function pagePathFor(href: string): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "app",
    "(protected)",
    href.replace(/^\//, ""),
    "page.tsx",
  );
}

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
        expect(existsSync(pagePathFor(item.href)), `${item.href} has no page.tsx`).toBe(true);
      }
    }
  });

  it("has no duplicate destinations", () => {
    // Two entries pointing at the same route means the user has to guess which
    // one is the "real" one.
    const hrefs = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has unique icons across all sidebar nav items with zero duplicates", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    const icons = items.map((item) => item.icon).filter(Boolean);
    expect(icons.length).toBe(items.length);
    expect(new Set(icons).size).toBe(items.length);
  });

  it("gates every nav link with exactly the capabilities its page requires", () => {
    // A visible link that lands on /access-restricted is the same failure mode as
    // a link that 404s: it advertises a capability the signed-in Admin does not
    // have. The page guard stays the authority — this only asserts the sidebar
    // tells the truth about it. Read from the page source so adding a route with
    // a stricter guard than its nav entry fails here, not in someone's browser.
    for (const item of [...NAV_SECTIONS.flatMap((section) => section.items), ...BOTTOM_NAV_ITEMS]) {
      const page = readFileSync(pagePathFor(item.href), "utf8");
      const guard = /require(?:PageCapability|AdminSession)\(\s*(\[[^\]]*\])?\s*\)/.exec(page);
      expect(guard, `${item.href} has no server-side capability guard`).not.toBeNull();

      const required = (guard?.[1]?.match(/ADMIN_[A-Z]+/g) ?? []).slice().sort();
      const declared = (item.capabilities ?? []).slice().sort();
      expect(declared, `${item.href} nav gate does not match its page guard`).toEqual(required);
    }
  });
});

describe("hasAnyCapability", () => {
  // Shared by the sidebar, the bottom nav, and the dashboard cards, so the same
  // rule decides every link the console offers.
  it("treats an ungated destination as open to any Admin", () => {
    expect(hasAnyCapability(["ADMIN_SUPPORT"])).toBe(true);
    expect(hasAnyCapability(["ADMIN_SUPPORT"], [])).toBe(true);
  });

  it("hides a Finance destination from a Support Admin", () => {
    expect(hasAnyCapability(["ADMIN_SUPPORT"], ["ADMIN_FINANCE"])).toBe(false);
  });

  it("hides a Support destination from a Finance Admin", () => {
    expect(hasAnyCapability(["ADMIN_FINANCE"], ["ADMIN_SUPPORT"])).toBe(false);
  });

  it("shows every destination to a super Admin", () => {
    expect(hasAnyCapability(["ADMIN_SUPER"], ["ADMIN_FINANCE"])).toBe(true);
    expect(hasAnyCapability(["ADMIN_SUPER"], ["ADMIN_SUPPORT"])).toBe(true);
  });

  it("keeps disputes finance-only", () => {
    // Disputes move escrowed money, so the destination is Finance-scoped in the
    // page guard, its server actions, the sidebar, and the dashboard card.
    const disputes = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.href === "/disputes");
    expect(disputes?.capabilities).toEqual(["ADMIN_FINANCE"]);
    expect(hasAnyCapability(["ADMIN_SUPPORT"], disputes?.capabilities)).toBe(false);
    expect(hasAnyCapability(["ADMIN_FINANCE"], disputes?.capabilities)).toBe(true);
  });
});
