import roster from "./dev-accounts.json";

/**
 * Development account roster, read from the single shared JSON file that also
 * drives `scripts/seed-supabase.mjs`. Because the seeder and the UI read the
 * same source, the credentials an app displays can never drift from the ones
 * actually provisioned.
 *
 * DEVELOPMENT ONLY. Every consumer must gate rendering on the resolved
 * environment being `development` (or `test`) — these values must never be
 * shown, or the accounts provisioned, against staging or production.
 */

export type DevAccountSurface = "admin" | "mobile";

export type DevAccount = {
  readonly email: string;
  readonly displayName: string;
  /** Short human label, e.g. "Approved Tasker". */
  readonly roleLabel: string;
  /** Which app the account is primarily used to sign into. */
  readonly surface: DevAccountSurface;
  readonly capabilities: ReadonlyArray<string>;
  readonly verified: boolean;
  readonly tasker: string | null;
  readonly purpose: string;
};

/** Shared password for every development account. */
export const DEV_ACCOUNT_PASSWORD: string = roster.password;

export const DEV_ACCOUNTS: ReadonlyArray<DevAccount> = roster.accounts.map((account) => ({
  email: account.email,
  displayName: account.displayName,
  roleLabel: account.roleLabel,
  surface: account.surface === "admin" ? "admin" : "mobile",
  capabilities: account.capabilities,
  verified: account.verified,
  tasker: account.tasker,
  purpose: account.purpose,
}));

/** The accounts primarily used to sign into a given app. */
export function devAccountsFor(surface: DevAccountSurface): ReadonlyArray<DevAccount> {
  return DEV_ACCOUNTS.filter((account) => account.surface === surface);
}
