import type {
  UserCapability,
  AccountStatus,
  VerificationStatus,
  TaskerApplicationStatus,
} from "@dizkarte/domain";
import type { DizkarteSupabaseClient } from "./client.js";

/**
 * Normalized identity/authorization context for a signed-in user, assembled
 * from the real backend tables (`profiles`, `user_capabilities`,
 * `verification_cases`, `tasker_applications`, `tasker_profiles`) rather than
 * any hardcoded directory. Both the mobile session and the Admin session
 * derive their view from this single source of truth.
 */
export type UserContext = {
  readonly userId: string;
  readonly displayName: string;
  readonly accountStatus: AccountStatus;
  readonly capabilities: ReadonlyArray<UserCapability>;
  readonly verificationStatus: VerificationStatus;
  readonly taskerApplicationStatus: TaskerApplicationStatus | null;
  /** True only when the Tasker profile is approved and not suspended. */
  readonly taskerApproved: boolean;
};

export type RawProfileRow = {
  readonly display_name: string;
  readonly account_status: string;
} | null;

export type RawCapabilityRow = { readonly capability: string };

export type RawStatusRow = { readonly status: string } | null;

export type RawTaskerProfileStatusRow = {
  readonly approved_at: string | null;
  readonly suspended_at: string | null;
} | null;

export type UserContextSource = {
  readonly userId: string;
  readonly profile: RawProfileRow;
  readonly capabilities: ReadonlyArray<RawCapabilityRow>;
  readonly latestVerification: RawStatusRow;
  readonly latestApplication: RawStatusRow;
  readonly taskerProfile: RawTaskerProfileStatusRow;
};

const KNOWN_CAPABILITIES: ReadonlyArray<UserCapability> = [
  "CLIENT",
  "TASKER",
  "ADMIN_SUPPORT",
  "ADMIN_FINANCE",
  "ADMIN_SUPER",
];

function toAccountStatus(value: string | undefined): AccountStatus {
  // Any unrecognized/absent status is treated as the most restrictive value
  // so a malformed row can never be read as an active account.
  return value === "active" || value === "suspended" || value === "banned" || value === "deactivated"
    ? (value as AccountStatus)
    : "deactivated";
}

function toVerificationStatus(value: string | null | undefined): VerificationStatus {
  const allowed: ReadonlyArray<VerificationStatus> = [
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "APPROVED",
    "REJECTED",
    "RESUBMISSION_REQUIRED",
  ];
  return value && (allowed as ReadonlyArray<string>).includes(value)
    ? (value as VerificationStatus)
    : "DRAFT";
}

function toApplicationStatus(value: string | null | undefined): TaskerApplicationStatus | null {
  const allowed: ReadonlyArray<TaskerApplicationStatus> = [
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "APPROVED",
    "REJECTED",
    "RESUBMISSION_REQUIRED",
    "SUSPENDED",
  ];
  return value && (allowed as ReadonlyArray<string>).includes(value)
    ? (value as TaskerApplicationStatus)
    : null;
}

/**
 * Pure projection from raw table rows to a normalized `UserContext`. Unknown
 * capability strings are dropped (never trusted), and missing rows collapse to
 * the safe default (no capabilities, unverified, not an approved Tasker).
 */
export function mapUserContext(source: UserContextSource): UserContext {
  const capabilities = source.capabilities
    .map((row) => row.capability)
    .filter((cap): cap is UserCapability =>
      (KNOWN_CAPABILITIES as ReadonlyArray<string>).includes(cap),
    );

  const approvedAt = source.taskerProfile?.approved_at ?? null;
  const suspendedAt = source.taskerProfile?.suspended_at ?? null;
  const taskerApproved = approvedAt !== null && suspendedAt === null;

  return {
    userId: source.userId,
    displayName: source.profile?.display_name ?? "",
    accountStatus: toAccountStatus(source.profile?.account_status),
    capabilities,
    verificationStatus: toVerificationStatus(source.latestVerification?.status),
    taskerApplicationStatus: toApplicationStatus(source.latestApplication?.status),
    taskerApproved,
  };
}

/**
 * Load the signed-in user's authorization context from the real tables. Every
 * query is RLS-bounded to the caller (self-read policies), so this returns only
 * the user's own data. Returns `null` when no profile row exists yet.
 */
export async function loadUserContext(
  client: DizkarteSupabaseClient,
  userId: string,
): Promise<UserContext | null> {
  const [profileRes, capsRes, verifRes, appRes, taskerRes] = await Promise.all([
    client.from("profiles").select("display_name,account_status").eq("id", userId).maybeSingle(),
    client.from("user_capabilities").select("capability").eq("user_id", userId).is("revoked_at", null),
    client
      .from("verification_cases")
      .select("status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("tasker_applications")
      .select("status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("tasker_profiles").select("approved_at,suspended_at").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileRes.error) {
    throw new Error(`Failed to load profile: ${profileRes.error.message}`);
  }
  if (!profileRes.data) {
    return null;
  }

  return mapUserContext({
    userId,
    profile: profileRes.data as RawProfileRow,
    capabilities: (capsRes.data ?? []) as ReadonlyArray<RawCapabilityRow>,
    latestVerification: (verifRes.data ?? null) as RawStatusRow,
    latestApplication: (appRes.data ?? null) as RawStatusRow,
    taskerProfile: (taskerRes.data ?? null) as RawTaskerProfileStatusRow,
  });
}
