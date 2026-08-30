import { describe, expect, it } from "vitest";
import { TASKER_APPLICATION_STATUSES } from "@dizkarte/domain";
import {
  isAwaitingAdminDecision,
  taskerApplicationStatusLabel,
  taskerApplicationStatusMeaning,
  taskerApplicationStatusTone,
  taskerDecisionsFor,
} from "./status";

describe("tasker application status vocabulary", () => {
  it("gives every status a plain-language label, tone and meaning", () => {
    // Driven off the domain enum so a new status cannot be added without also
    // being described here — an undescribed status would render as raw SQL.
    for (const status of TASKER_APPLICATION_STATUSES) {
      expect(taskerApplicationStatusLabel(status), status).not.toBe(status);
      expect(taskerApplicationStatusTone(status), status).toBeTruthy();
      expect(taskerApplicationStatusMeaning(status).length, status).toBeGreaterThan(0);
    }
  });

  it("never leaks a raw enum value into a label", () => {
    for (const status of TASKER_APPLICATION_STATUSES) {
      expect(taskerApplicationStatusLabel(status)).not.toMatch(/_/);
    }
  });

  it("treats only pre-decision states as waiting on the Admin", () => {
    expect(isAwaitingAdminDecision("SUBMITTED")).toBe(true);
    expect(isAwaitingAdminDecision("IN_REVIEW")).toBe(true);
    expect(isAwaitingAdminDecision("RESUBMISSION_REQUIRED")).toBe(false);
    expect(isAwaitingAdminDecision("APPROVED")).toBe(false);
  });
});

describe("taskerDecisionsFor", () => {
  it("never offers a decision equal to the current status", () => {
    // `decide_tasker_application` returns early when the decision matches the
    // current status, so such a button would look functional and do nothing.
    for (const status of TASKER_APPLICATION_STATUSES) {
      for (const option of taskerDecisionsFor(status)) {
        expect(option.decision, `${status} offered a no-op`).not.toBe(status);
      }
    }
  });

  it("offers approve, request changes and reject while under review", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW"]) {
      expect(taskerDecisionsFor(status).map((o) => o.decision)).toEqual([
        "APPROVED",
        "RESUBMISSION_REQUIRED",
        "REJECTED",
      ]);
    }
  });

  it("offers only suspension once approved", () => {
    expect(taskerDecisionsFor("APPROVED").map((o) => o.decision)).toEqual(["SUSPENDED"]);
  });

  it("offers reinstatement for a suspended Tasker", () => {
    const options = taskerDecisionsFor("SUSPENDED");
    expect(options.map((o) => o.decision)).toContain("APPROVED");
    expect(options.find((o) => o.decision === "APPROVED")?.label).toBe("Reinstate Tasker");
  });

  it("treats rejection as final in the console", () => {
    expect(taskerDecisionsFor("REJECTED")).toEqual([]);
  });

  it("marks exactly one option as primary so the recommended action is unambiguous", () => {
    for (const status of TASKER_APPLICATION_STATUSES) {
      const options = taskerDecisionsFor(status);
      if (options.length === 0) continue;
      const primary = options.filter((o) => o.emphasis === "primary");
      expect(primary.length, `${status} has ${primary.length} primary actions`).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it("states a consequence for every option", () => {
    for (const status of TASKER_APPLICATION_STATUSES) {
      for (const option of taskerDecisionsFor(status)) {
        expect(option.description.length, option.label).toBeGreaterThan(40);
        expect(option.label).not.toMatch(/_/);
      }
    }
  });
});
