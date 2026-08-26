/**
 * Expo-backed `PushRuntime` and token store.
 *
 * `expo-notifications` and `AsyncStorage` are loaded lazily through `require`,
 * following the same rule as `marketplace/factory.ts`: reaching them at module
 * scope would pull React Native into the pure test environment (which has no RN
 * transform) for every consumer of this module.
 *
 * Nothing here decides anything — the decision table lives in `registration.ts`,
 * which is unit-tested against a fake runtime.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import type { PushPermissionStatus, PushRuntime, PushTokenStore } from "./registration";

const TOKEN_STORAGE_KEY = "dizkarte.push.tokenReference";

type ExpoNotificationsModule = {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain?: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
  setNotificationHandler(handler: unknown): void;
};

function loadNotifications(): ExpoNotificationsModule | null {
  // `expo-notifications` deliberately throws (not just warns) when any of its
  // Android push APIs are touched inside Expo Go from SDK 53 onward — including
  // as a side effect of `require`-ing the module itself, before this function's
  // own try/catch below can run. Short-circuiting here avoids ever reaching
  // that throw, instead of relying on catching it after the fact.
  // See: https://docs.expo.dev/develop/development-builds/introduction/
  if (Platform.OS === "android" && isRunningInExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load; see above
    return require("expo-notifications") as ExpoNotificationsModule;
  } catch {
    // The native module is absent (web export, or a build without the plugin).
    return null;
  }
}

function toPermissionStatus(status: string, canAskAgain?: boolean): PushPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  // iOS reports `denied` with canAskAgain=true the first time in some flows;
  // treating that as undetermined keeps a single legitimate prompt possible.
  if (canAskAgain === true && status !== "granted") return "undetermined";
  return "denied";
}

/**
 * The EAS project id Expo needs to mint a push token.
 *
 * Absent until the Client's EAS/Firebase/APNs setup exists (release blocker B4),
 * which is why its absence resolves to a truthful "not configured" instead of an
 * error or a fabricated token.
 */
function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export function createExpoPushRuntime(): PushRuntime {
  return {
    platform: Platform.OS,
    async getPermissions() {
      const notifications = loadNotifications();
      if (!notifications) return "denied";
      const result = await notifications.getPermissionsAsync();
      return toPermissionStatus(result.status, result.canAskAgain);
    },
    async requestPermissions() {
      const notifications = loadNotifications();
      if (!notifications) return "denied";
      const result = await notifications.requestPermissionsAsync();
      return toPermissionStatus(result.status);
    },
    async getToken() {
      const notifications = loadNotifications();
      if (!notifications) return null;
      const projectId = resolveProjectId();
      if (!projectId) return null;
      const token = await notifications.getExpoPushTokenAsync({ projectId });
      return token.data ?? null;
    },
  };
}

type AsyncStorageModule = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function loadStorage(): AsyncStorageModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load; see above
    const module = require("@react-native-async-storage/async-storage") as {
      default: AsyncStorageModule;
    };
    return module.default;
  } catch {
    return null;
  }
}

/**
 * Remembers the token this device registered, so sign-out can revoke exactly
 * that row. A missing storage module degrades to "nothing remembered", which
 * only costs the revoke — never correctness of the registration itself.
 */
export function createPushTokenStore(): PushTokenStore {
  return {
    async read() {
      const storage = loadStorage();
      if (!storage) return null;
      try {
        return await storage.getItem(TOKEN_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    async write(token) {
      const storage = loadStorage();
      if (!storage) return;
      try {
        await storage.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        // Non-fatal: the registration itself already succeeded.
      }
    },
    async clear() {
      const storage = loadStorage();
      if (!storage) return;
      try {
        await storage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Non-fatal.
      }
    },
  };
}
