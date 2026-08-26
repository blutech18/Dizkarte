/**
 * App-facing push registration service.
 *
 * One entry point per lifecycle moment:
 *   * `syncPushRegistration(userId)` — called when a session becomes available.
 *   * `releasePushRegistration(userId)` — called immediately BEFORE sign-out,
 *     while the user's JWT can still update their own `devices` row.
 *
 * Both are idempotent and never throw. The last outcome is cached so the
 * preferences screen can tell the user the truth about this device instead of a
 * blanket "push is in development mode".
 */

import { createMarketplaceRepository } from "../marketplace/factory";
import { createExpoPushRuntime, createPushTokenStore } from "./expo-runtime";
import { registerPushDevice, releasePushDevice, type PushRegistrationResult } from "./registration";

let lastResult: PushRegistrationResult | null = null;
/** Guards against repeat work when several screens mount at once. */
let inFlight: Promise<PushRegistrationResult> | null = null;
let registeredFor: string | null = null;

export function getLastPushRegistrationResult(): PushRegistrationResult | null {
  return lastResult;
}

export async function syncPushRegistration(userId: string): Promise<PushRegistrationResult> {
  if (registeredFor === userId && lastResult?.status === "registered") return lastResult;
  if (inFlight) return inFlight;

  inFlight = registerPushDevice({
    runtime: createExpoPushRuntime(),
    writer: createMarketplaceRepository(),
    store: createPushTokenStore(),
    userId,
  })
    .then((result) => {
      lastResult = result;
      registeredFor = result.status === "registered" ? userId : null;
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function releasePushRegistration(userId: string): Promise<void> {
  registeredFor = null;
  lastResult = null;
  await releasePushDevice({
    writer: createMarketplaceRepository(),
    store: createPushTokenStore(),
    userId,
  });
}

/** Test-only reset so cached state cannot leak between tests. */
export function __resetPushRegistrationForTests(): void {
  lastResult = null;
  inFlight = null;
  registeredFor = null;
}
