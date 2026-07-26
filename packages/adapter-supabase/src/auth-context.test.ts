import { describe, it, expect } from "vitest";
import { mapUserContext, type UserContextSource } from "./auth-context.js";

const USER_ID = "33333333-3333-4333-8333-333333333333";

function source(overrides: Partial<UserContextSource> = {}): UserContextSource {
  return {
    userId: USER_ID,
    profile: { display_name: "Maria Santos", account_status: "active" },
    capabilities: [{ capability: "CLIENT" }],
    latestVerification: { status: "APPROVED" },
    latestApplication: null,
    taskerProfile: null,
    ...overrides,
  };
}

describe("mapUserContext", () => {
  it("maps a verified client", () => {
    const ctx = mapUserContext(source());
    expect(ctx.userId).toBe(USER_ID);
    expect(ctx.displayName).toBe("Maria Santos");
    expect(ctx.accountStatus).toBe("active");
    expect(ctx.capabilities).toEqual(["CLIENT"]);
    expect(ctx.verificationStatus).toBe("APPROVED");
    expect(ctx.taskerApplicationStatus).toBeNull();
    expect(ctx.taskerApproved).toBe(false);
  });

  it("treats a tasker as approved only when approved_at is set and suspended_at is null", () => {
    const approved = mapUserContext(
      source({
        capabilities: [{ capability: "TASKER" }],
        latestApplication: { status: "APPROVED" },
        taskerProfile: { approved_at: "2026-07-01T00:00:00Z", suspended_at: null },
      }),
    );
    expect(approved.taskerApproved).toBe(true);

    const suspended = mapUserContext(
      source({
        capabilities: [{ capability: "TASKER" }],
        latestApplication: { status: "SUSPENDED" },
        taskerProfile: { approved_at: "2026-07-01T00:00:00Z", suspended_at: "2026-07-10T00:00:00Z" },
      }),
    );
    expect(suspended.taskerApproved).toBe(false);

    const notYet = mapUserContext(
      source({
        capabilities: [{ capability: "TASKER" }],
        latestApplication: { status: "IN_REVIEW" },
        taskerProfile: { approved_at: null, suspended_at: null },
      }),
    );
    expect(notYet.taskerApproved).toBe(false);
  });

  it("drops unknown capability strings and never trusts them", () => {
    const ctx = mapUserContext(
      source({ capabilities: [{ capability: "CLIENT" }, { capability: "ROOT" }, { capability: "" }] }),
    );
    expect(ctx.capabilities).toEqual(["CLIENT"]);
  });

  it("collapses a missing profile/verification to safe defaults", () => {
    const ctx = mapUserContext({
      userId: USER_ID,
      profile: null,
      capabilities: [],
      latestVerification: null,
      latestApplication: null,
      taskerProfile: null,
    });
    expect(ctx.displayName).toBe("");
    expect(ctx.accountStatus).toBe("deactivated");
    expect(ctx.capabilities).toEqual([]);
    expect(ctx.verificationStatus).toBe("DRAFT");
  });

  it("maps admin capabilities", () => {
    const ctx = mapUserContext(
      source({ capabilities: [{ capability: "ADMIN_SUPER" }], latestVerification: null }),
    );
    expect(ctx.capabilities).toEqual(["ADMIN_SUPER"]);
  });
});
