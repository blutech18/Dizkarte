import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerPushDevice,
  releasePushDevice,
  type PushPermissionStatus,
  type PushRuntime,
} from "./registration";

const VALID_TOKEN = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]";

function makeWriter() {
  return {
    registerPushDevice: vi.fn(async () => undefined),
    disablePushDevice: vi.fn(async () => undefined),
  };
}

function makeStore(initial: string | null = null) {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (token: string) => {
      value = token;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    current: () => value,
  };
}

function makeRuntime(overrides: Partial<PushRuntime> = {}): PushRuntime {
  return {
    platform: "android",
    getPermissions: async (): Promise<PushPermissionStatus> => "granted",
    requestPermissions: async (): Promise<PushPermissionStatus> => "granted",
    getToken: async () => VALID_TOKEN,
    ...overrides,
  };
}

describe("registerPushDevice", () => {
  let writer: ReturnType<typeof makeWriter>;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    writer = makeWriter();
    store = makeStore();
  });

  it("registers the device and remembers the token", async () => {
    const result = await registerPushDevice({
      runtime: makeRuntime(),
      writer,
      store,
      userId: "user-1",
    });

    expect(result).toEqual({ status: "registered", tokenReference: VALID_TOKEN });
    expect(writer.registerPushDevice).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "android",
      tokenReference: VALID_TOKEN,
    });
    // Remembered so sign-out can revoke exactly this row.
    expect(store.current()).toBe(VALID_TOKEN);
  });

  it("is unsupported on web and never touches the repository", async () => {
    const result = await registerPushDevice({
      runtime: makeRuntime({ platform: "web" }),
      writer,
      store,
      userId: "user-1",
    });

    expect(result.status).toBe("unsupported");
    expect(writer.registerPushDevice).not.toHaveBeenCalled();
  });

  it("prompts only when permission is still undetermined", async () => {
    const requestPermissions = vi.fn(async (): Promise<PushPermissionStatus> => "granted");
    await registerPushDevice({
      runtime: makeRuntime({ getPermissions: async () => "undetermined", requestPermissions }),
      writer,
      store,
      userId: "user-1",
    });
    expect(requestPermissions).toHaveBeenCalledTimes(1);

    const notAsked = vi.fn(async (): Promise<PushPermissionStatus> => "granted");
    await registerPushDevice({
      runtime: makeRuntime({ getPermissions: async () => "granted", requestPermissions: notAsked }),
      writer,
      store,
      userId: "user-2",
    });
    expect(notAsked).not.toHaveBeenCalled();
  });

  it("reports denied without registering when the user refuses", async () => {
    const result = await registerPushDevice({
      runtime: makeRuntime({
        getPermissions: async () => "undetermined",
        requestPermissions: async () => "denied",
      }),
      writer,
      store,
      userId: "user-1",
    });

    expect(result.status).toBe("denied");
    expect(writer.registerPushDevice).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("reports not_configured when the build has no push credentials", async () => {
    // Truthful state for the documented push blocker (B4): no EAS project id, so
    // Expo cannot mint a token. Not an error, and never a fabricated token.
    const result = await registerPushDevice({
      runtime: makeRuntime({ getToken: async () => null }),
      writer,
      store,
      userId: "user-1",
    });

    expect(result.status).toBe("not_configured");
    expect(writer.registerPushDevice).not.toHaveBeenCalled();
  });

  it("refuses a malformed token rather than storing an undeliverable row", async () => {
    const result = await registerPushDevice({
      runtime: makeRuntime({ getToken: async () => "fcm:not-an-expo-token" }),
      writer,
      store,
      userId: "user-1",
    });

    expect(result.status).toBe("error");
    expect(writer.registerPushDevice).not.toHaveBeenCalled();
  });

  it("never throws when the repository write fails", async () => {
    writer.registerPushDevice.mockRejectedValueOnce(new Error("network"));

    const result = await registerPushDevice({
      runtime: makeRuntime(),
      writer,
      store,
      userId: "user-1",
    });

    expect(result.status).toBe("error");
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects an empty user id", async () => {
    const result = await registerPushDevice({
      runtime: makeRuntime(),
      writer,
      store,
      userId: "",
    });
    expect(result.status).toBe("error");
    expect(writer.registerPushDevice).not.toHaveBeenCalled();
  });
});

describe("releasePushDevice", () => {
  it("disables the remembered token and forgets it", async () => {
    const writer = makeWriter();
    const store = makeStore(VALID_TOKEN);

    const result = await releasePushDevice({ writer, store, userId: "user-1" });

    expect(result.released).toBe(true);
    expect(writer.disablePushDevice).toHaveBeenCalledWith("user-1", VALID_TOKEN);
    expect(store.current()).toBeNull();
  });

  it("does nothing when this device never registered", async () => {
    const writer = makeWriter();
    const store = makeStore(null);

    const result = await releasePushDevice({ writer, store, userId: "user-1" });

    expect(result.released).toBe(false);
    expect(writer.disablePushDevice).not.toHaveBeenCalled();
  });

  it("never blocks sign-out when the revoke fails", async () => {
    const writer = makeWriter();
    writer.disablePushDevice.mockRejectedValueOnce(new Error("offline"));
    const store = makeStore(VALID_TOKEN);

    await expect(releasePushDevice({ writer, store, userId: "user-1" })).resolves.toEqual({
      released: false,
    });
  });
});
