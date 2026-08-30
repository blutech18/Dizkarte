import { describe, expect, it } from "vitest";
import { USER_STATUS_OPTIONS, userStatusLabel, userStatusMeaning, userStatusTone } from "./status";

describe("user account status vocabulary", () => {
  it("maps every option to a capitalised plain-language label", () => {
    for (const status of USER_STATUS_OPTIONS) {
      const label = userStatusLabel(status);
      expect(label).not.toMatch(/_/);
      // Never the raw lowercase enum in front of an agent.
      expect(label[0]).toBe(label[0]!.toUpperCase());
    }
  });

  it("reserves the error tone for banned and warning for suspended", () => {
    expect(userStatusTone("banned")).toBe("error");
    expect(userStatusTone("suspended")).toBe("warning");
    expect(userStatusTone("active")).toBe("success");
    expect(userStatusTone("deactivated")).toBe("neutral");
  });

  it("states whether each status blocks sign-in", () => {
    expect(userStatusMeaning("active")).toMatch(/Can sign in/);
    expect(userStatusMeaning("suspended")).toMatch(/Cannot sign in/);
    expect(userStatusMeaning("banned")).toMatch(/locked out/);
  });

  it("falls back without inventing a meaning for an unknown status", () => {
    expect(userStatusLabel("mystery")).toBe("mystery");
    expect(userStatusTone("mystery")).toBe("neutral");
    expect(userStatusMeaning("mystery")).toMatch(/not recognised/);
  });
});
