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
});
