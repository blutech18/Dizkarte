/**
 * Push device registration — the pure decision layer.
 *
 * Push had a complete server side (the 0020/0043/0044 producers, the
 * `devices` table, the `push-dispatch` edge function) and a complete port
 * (`registerPushDevice` / `disablePushDevice`), but nothing ever acquired a
 * device token, so `devices` stayed empty and every dispatch took the
 * "no devices" branch. This module is the missing half.
 *
 * The native module is injected as a `PushRuntime` rather than imported, so the
 * whole decision table — unsupported platform, denied permission, unconfigured
 * project, malformed token, repository failure — is testable in the pure test
 * environment with no Expo/React Native transform.
 */

import { isExpoPushToken } from "@dizkarte/domain";

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export type PushRegistrationStatus =
  /** A valid token was stored against the signed-in user. */
  | "registered"
  /** The platform has no push channel we support (web, or an unknown OS). */
  | "unsupported"
  /** The user declined the OS prompt, or it was declined earlier. */
  | "denied"
  /** No push credentials/EAS project yet — the documented Client-owned blocker. */
  | "not_configured"
  /** Something failed; the app continues with in-app notifications only. */
  | "error";

export type PushRegistrationResult = {
  readonly status: PushRegistrationStatus;
  /** Present only for `registered`. */
  readonly tokenReference?: string;
  /** Short, non-secret explanation for logs and the preferences screen. */
  readonly detail?: string;
};

/** The native surface this module needs. Supplied by `expo-runtime.ts` at runtime. */
export type PushRuntime = {
  /** `Platform.OS`. */
  readonly platform: string;
  /** Current OS permission, without prompting. */
  getPermissions(): Promise<PushPermissionStatus>;
  /** Prompt for permission. Only called when it may still be granted. */
  requestPermissions(): Promise<PushPermissionStatus>;
  /**
   * Fetch the device push token. Returns null when push is not configured
   * (no EAS project id / no Apple-Google credentials in the build), which is a
   * truthful "not configured" rather than an error.
   */
  getToken(): Promise<string | null>;
};

/** The only two port methods this module touches. */
export type PushDeviceWriter = {
  registerPushDevice(input: {
    userId: string;
    platform: "ios" | "android";
    tokenReference: string;
  }): Promise<void>;
  disablePushDevice(userId: string, tokenReference: string): Promise<void>;
};

/** Where the last registered token is remembered, so sign-out can revoke it. */
export type PushTokenStore = {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
};

function isSupportedPlatform(platform: string): platform is "ios" | "android" {
  return platform === "ios" || platform === "android";
}

/**
 * Register this device for the signed-in user.
 *
 * Never throws: a device that cannot register must degrade to in-app-only
 * notifications, not break the app shell that calls this on sign-in.
 *
 * Permission is requested only when it is still `undetermined`. Re-prompting a
 * user who already said no is both futile (the OS suppresses it) and hostile.
 */
export async function registerPushDevice(deps: {
  readonly runtime: PushRuntime;
  readonly writer: PushDeviceWriter;
  readonly store: PushTokenStore;
  readonly userId: string;
}): Promise<PushRegistrationResult> {
  const { runtime, writer, store, userId } = deps;

  if (!isSupportedPlatform(runtime.platform)) {
    return { status: "unsupported", detail: `platform ${runtime.platform}` };
  }
  if (!userId) return { status: "error", detail: "no signed-in user" };

  try {
    let permission = await runtime.getPermissions();
    if (permission === "undetermined") {
      permission = await runtime.requestPermissions();
    }
    if (permission !== "granted") {
      return { status: "denied", detail: "notification permission not granted" };
    }

    const token = await runtime.getToken();
    if (!token) {
      return { status: "not_configured", detail: "no push credentials in this build" };
    }
    if (!isExpoPushToken(token)) {
      // A malformed token would be stored and then rejected on every send, so it
      // is refused here instead of polluting `devices`.
      return { status: "error", detail: "device returned a malformed push token" };
    }

    await writer.registerPushDevice({
      userId,
      platform: runtime.platform,
      tokenReference: token,
    });
    await store.write(token);
    return { status: "registered", tokenReference: token };
  } catch {
    return { status: "error", detail: "registration failed" };
  }
}

/**
 * Revoke this device's registration — call BEFORE ending the session.
 *
 * Ordering matters: `devices` writes are gated by RLS on the caller's own rows,
 * so once the JWT is gone the row can no longer be disabled. Leaving it enabled
 * would let the previous user's pushes arrive on a phone somebody else is now
 * signed into.
 */
export async function releasePushDevice(deps: {
  readonly writer: PushDeviceWriter;
  readonly store: PushTokenStore;
  readonly userId: string;
}): Promise<{ readonly released: boolean }> {
  try {
    const token = await deps.store.read();
    if (!token || !deps.userId) return { released: false };
    await deps.writer.disablePushDevice(deps.userId, token);
    await deps.store.clear();
    return { released: true };
  } catch {
    // Best effort: a failed revoke must not block sign-out.
    return { released: false };
  }
}
