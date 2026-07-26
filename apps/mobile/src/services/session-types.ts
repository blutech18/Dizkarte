import type {
  UserCapability,
  AccountStatus,
  VerificationStatus,
  TaskerApplicationStatus,
} from "@dizkarte/domain";

/**
 * Mobile session shape.
 *
 * This is the client-visible session projection. Capabilities are always
 * treated as server-issued and read-only here — the mobile app never invents
 * or self-grants a capability (core invariant 1: authentication is never a
 * substitute for row/action authorization). The real backend integration
 * (Supabase Auth + `user_capabilities` lookups) is a documented follow-up;
 * this pass provides the typed session boundary and a deterministic
 * synthetic implementation behind it.
 */
export type MobileSession = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly capabilities: ReadonlyArray<UserCapability>;
  readonly accountStatus: AccountStatus;
  readonly verificationStatus: VerificationStatus;
  readonly taskerApplicationStatus: TaskerApplicationStatus | null;
  readonly synthetic: boolean;
};

export function isTasker(session: MobileSession | null): boolean {
  return session?.capabilities.includes("TASKER") ?? false;
}

export function isClient(session: MobileSession | null): boolean {
  return session?.capabilities.includes("CLIENT") ?? false;
}

export function isIdentityVerified(session: MobileSession | null): boolean {
  return session?.verificationStatus === "APPROVED";
}

export function isApprovedTasker(session: MobileSession | null): boolean {
  return isTasker(session) && session?.taskerApplicationStatus === "APPROVED";
}

/**
 * Full offer-submission eligibility gate: approved Tasker application AND
 * identity verification AND an active (non-suspended/banned/deactivated)
 * account. This is intentionally stricter than `isApprovedTasker` — which
 * only reflects Tasker Dashboard *visibility* — and mirrors
 * `@dizkarte/domain`'s `canSubmitOffer` server-side predicate so the mobile
 * gate and the backend authorization check agree.
 */
export function isEligibleTasker(session: MobileSession | null): boolean {
  return (
    isApprovedTasker(session) && isIdentityVerified(session) && session?.accountStatus === "active"
  );
}
