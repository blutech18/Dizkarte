import { describe, expect, it } from "vitest";
import {
  isApprovedTasker,
  isClient,
  isEligibleTasker,
  isIdentityVerified,
  isTasker,
  type MobileSession,
} from "./session-types";

function makeSession(overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    userId: "u1",
    email: "user@dev.dizkarte.invalid",
    displayName: "Test User",
    capabilities: [],
    accountStatus: "active",
    verificationStatus: "DRAFT",
    taskerApplicationStatus: null,
    synthetic: true,
    ...overrides,
  };
}

describe("session capability gates", () => {
  it("treats a null session as having no capabilities", () => {
    expect(isTasker(null)).toBe(false);
    expect(isClient(null)).toBe(false);
    expect(isIdentityVerified(null)).toBe(false);
    expect(isApprovedTasker(null)).toBe(false);
  });

  it("isClient is true only when CLIENT capability is present", () => {
    expect(isClient(makeSession({ capabilities: ["CLIENT"] }))).toBe(true);
    expect(isClient(makeSession({ capabilities: ["TASKER"] }))).toBe(false);
  });

  it("isApprovedTasker requires both TASKER capability and APPROVED application status", () => {
    expect(
      isApprovedTasker(
        makeSession({ capabilities: ["TASKER"], taskerApplicationStatus: "APPROVED" }),
      ),
    ).toBe(true);
    expect(
      isApprovedTasker(
        makeSession({ capabilities: ["TASKER"], taskerApplicationStatus: "IN_REVIEW" }),
      ),
    ).toBe(false);
    expect(
      isApprovedTasker(makeSession({ capabilities: [], taskerApplicationStatus: "APPROVED" })),
    ).toBe(false);
  });

  it("isIdentityVerified requires verificationStatus to be APPROVED exactly", () => {
    expect(isIdentityVerified(makeSession({ verificationStatus: "APPROVED" }))).toBe(true);
    expect(isIdentityVerified(makeSession({ verificationStatus: "SUBMITTED" }))).toBe(false);
  });
});

describe("isEligibleTasker", () => {
  function eligibleBase(overrides: Partial<MobileSession> = {}): MobileSession {
    return makeSession({
      capabilities: ["TASKER"],
      accountStatus: "active",
      verificationStatus: "APPROVED",
      taskerApplicationStatus: "APPROVED",
      ...overrides,
    });
  }

  it("passes only for an active, TASKER-capable, identity-approved, Tasker-approved session", () => {
    expect(isEligibleTasker(eligibleBase())).toBe(true);
  });

  it("treats a null session as ineligible", () => {
    expect(isEligibleTasker(null)).toBe(false);
  });

  it("fails when the Tasker application is unapproved/in review", () => {
    expect(isEligibleTasker(eligibleBase({ taskerApplicationStatus: "IN_REVIEW" }))).toBe(false);
  });

  it("fails when the Tasker application is null (never applied)", () => {
    expect(isEligibleTasker(eligibleBase({ taskerApplicationStatus: null }))).toBe(false);
  });

  it("fails when the Tasker application was rejected", () => {
    expect(isEligibleTasker(eligibleBase({ taskerApplicationStatus: "REJECTED" }))).toBe(false);
  });

  it("fails when the Tasker application is suspended", () => {
    expect(isEligibleTasker(eligibleBase({ taskerApplicationStatus: "SUSPENDED" }))).toBe(false);
  });

  it("fails when identity verification is not approved (unverified)", () => {
    expect(isEligibleTasker(eligibleBase({ verificationStatus: "SUBMITTED" }))).toBe(false);
    expect(isEligibleTasker(eligibleBase({ verificationStatus: "DRAFT" }))).toBe(false);
  });

  it("fails when the account is suspended", () => {
    expect(isEligibleTasker(eligibleBase({ accountStatus: "suspended" }))).toBe(false);
  });

  it("fails when the account is banned", () => {
    expect(isEligibleTasker(eligibleBase({ accountStatus: "banned" }))).toBe(false);
  });

  it("fails when the account is deactivated", () => {
    expect(isEligibleTasker(eligibleBase({ accountStatus: "deactivated" }))).toBe(false);
  });

  it("fails when the TASKER capability is missing even if every other field is approved", () => {
    expect(isEligibleTasker(eligibleBase({ capabilities: [] }))).toBe(false);
    expect(isEligibleTasker(eligibleBase({ capabilities: ["CLIENT"] }))).toBe(false);
  });
});
