import { describe, expect, it } from "vitest";
import { decideAuthAction, mayDowngradeToSignedOut } from "./session-events";

const USER = "94110566-40e6-4eed-88fe-3ca423c04b5c";
const OTHER = "92e01881-47a6-402f-bb1e-497a324e2e72";

describe("decideAuthAction", () => {
  it("routes a password-recovery session to the set-password screen", () => {
    expect(
      decideAuthAction({ event: "PASSWORD_RECOVERY", nextUserId: USER, currentUserId: null }),
    ).toBe("route-password-recovery");
  });

  it("clears on an explicit sign-out", () => {
    expect(
      decideAuthAction({ event: "SIGNED_OUT", nextUserId: null, currentUserId: USER }),
    ).toBe("clear");
  });

  it("clears whenever the event carries no user", () => {
    expect(
      decideAuthAction({ event: "INITIAL_SESSION", nextUserId: null, currentUserId: null }),
    ).toBe("clear");
  });

  it("keeps the existing projection across a token refresh", () => {
    // The idle-logout bug: this used to re-derive, and any transient failure
    // during that re-derivation signed the user out.
    expect(
      decideAuthAction({ event: "TOKEN_REFRESHED", nextUserId: USER, currentUserId: USER }),
    ).toBe("keep");
  });

  it("keeps the existing projection when only user metadata changed", () => {
    expect(
      decideAuthAction({ event: "USER_UPDATED", nextUserId: USER, currentUserId: USER }),
    ).toBe("keep");
  });

  it("derives on first sign-in", () => {
    expect(
      decideAuthAction({ event: "SIGNED_IN", nextUserId: USER, currentUserId: null }),
    ).toBe("derive");
  });

  it("derives when the signed-in user actually changes", () => {
    expect(
      decideAuthAction({ event: "SIGNED_IN", nextUserId: OTHER, currentUserId: USER }),
    ).toBe("derive");
  });

  it("derives on the initial session restored from storage", () => {
    expect(
      decideAuthAction({ event: "INITIAL_SESSION", nextUserId: USER, currentUserId: null }),
    ).toBe("derive");
  });

  it("never returns keep without an established session", () => {
    for (const event of ["TOKEN_REFRESHED", "USER_UPDATED", "SIGNED_IN", "INITIAL_SESSION"]) {
      expect(decideAuthAction({ event, nextUserId: USER, currentUserId: null })).toBe("derive");
    }
  });
});

describe("mayDowngradeToSignedOut", () => {
  it("allows signing out when no session was ever established", () => {
    expect(mayDowngradeToSignedOut(false)).toBe(true);
  });

  it("refuses to sign out an established session on a derivation failure", () => {
    // Supabase still holds valid tokens; a dropped request must not evict the
    // user to the welcome screen.
    expect(mayDowngradeToSignedOut(true)).toBe(false);
  });
});
