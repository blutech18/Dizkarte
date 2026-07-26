import { z } from "zod";
import type { UserId } from "./ids.js";

/**
 * User capabilities and Admin capability sets.
 *
 * Capabilities are granted server-side and stored in `user_capabilities`; the
 * client can never assert its own role. Authentication is never a substitute
 * for row/action authorization (core invariant 1).
 */

export const USER_CAPABILITIES = [
  "CLIENT",
  "TASKER",
  "ADMIN_SUPPORT",
  "ADMIN_FINANCE",
  "ADMIN_SUPER",
] as const;
export type UserCapability = (typeof USER_CAPABILITIES)[number];

export const ADMIN_CAPABILITIES = [
  "ADMIN_SUPPORT",
  "ADMIN_FINANCE",
  "ADMIN_SUPER",
] as const satisfies ReadonlyArray<UserCapability>;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export function isAdminCapability(capability: UserCapability): capability is AdminCapability {
  return (ADMIN_CAPABILITIES as ReadonlyArray<string>).includes(capability);
}

export const ACCOUNT_STATUSES = ["active", "suspended", "banned", "deactivated"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * The external actor performing a command. Derived from a verified session on
 * the server; never trusted from client-supplied role fields.
 */
export type ActorContext = {
  readonly userId: UserId;
  readonly capabilities: ReadonlyArray<UserCapability>;
  readonly accountStatus: AccountStatus;
  /** Set when identity verification is approved. */
  readonly identityVerified: boolean;
  /** Set when the Tasker application is approved and not suspended. */
  readonly taskerApproved: boolean;
};

export function hasCapability(actor: ActorContext, capability: UserCapability): boolean {
  return actor.capabilities.includes(capability);
}

export function hasAnyCapability(
  actor: ActorContext,
  capabilities: ReadonlyArray<UserCapability>,
): boolean {
  return capabilities.some((c) => actor.capabilities.includes(c));
}

export function isActiveAdmin(actor: ActorContext): boolean {
  return actor.accountStatus === "active" && actor.capabilities.some((c) => isAdminCapability(c));
}

export const userCapabilitySchema = z.enum(USER_CAPABILITIES);
export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);
