import { describe, expect, it } from "vitest";
import {
  VERIFICATION_STATUS_OPTIONS,
  verificationDecisionsFor,
  verificationStatusLabel,
  verificationStatusTone,
} from "./status";

const STATUSES = [
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
] as const;

describe("verification status mapping", () => {
  it("maps every known status to plain language and a literal tone", () => {
    for (const status of STATUSES) {
      expect(verificationStatusLabel(status).length).toBeGreaterThan(0);
      expect(verificationStatusLabel(status)).not.toMatch(/_/);
      expect(verificationStatusTone(status)).toBeTruthy();
    }
  });

  it("uses success tone only for APPROVED and error tone only for REJECTED", () => {
    expect(verificationStatusTone("APPROVED")).toBe("success");
    expect(verificationStatusTone("REJECTED")).toBe("error");
  });

  it("exposes every reviewable status as a filter option in plain language", () => {
    // DRAFT is not submitted work, so it must never appear as queue filter.
    expect(VERIFICATION_STATUS_OPTIONS).not.toContain("DRAFT");
    expect([...VERIFICATION_STATUS_OPTIONS].sort()).toEqual([...STATUSES].sort());
    for (const status of VERIFICATION_STATUS_OPTIONS) {
      expect(verificationStatusLabel(status)).not.toMatch(/_/);
    }
  });
});

describe("verificationDecisionsFor", () => {
  it("offers all three audited decisions only while a case is reviewable", () => {
    const expected = ["APPROVED", "RESUBMISSION_REQUIRED", "REJECTED"];
    expect(verificationDecisionsFor("SUBMITTED").map((option) => option.decision)).toEqual(
      expected,
    );
    expect(verificationDecisionsFor("IN_REVIEW").map((option) => option.decision)).toEqual(
      expected,
    );
  });

  it("offers no actions while waiting for resubmission", () => {
    // The database only accepts a decision from SUBMITTED/IN_REVIEW. The old UI
    // rendered actions here that could only fail or perform a same-state no-op.
    expect(verificationDecisionsFor("RESUBMISSION_REQUIRED")).toEqual([]);
  });

  it("offers no actions after a final decision", () => {
    expect(verificationDecisionsFor("APPROVED")).toEqual([]);
    expect(verificationDecisionsFor("REJECTED")).toEqual([]);
  });

  it("uses one primary action and states a consequence for every decision", () => {
    const options = verificationDecisionsFor("IN_REVIEW");
    expect(options.filter((option) => option.emphasis === "primary")).toHaveLength(1);
    for (const option of options) {
      expect(option.description.length).toBeGreaterThan(50);
      expect(option.label).not.toMatch(/_/);
    }
  });
});
