import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests lock the platform-aware local-file read in `uploadFile`.
 *
 * The web path must NOT touch `expo-file-system` (its `File` API throws
 * "expo-file-system is not supported on web"); it reads the picked `blob:` URL
 * through `fetch`. The native path must use the `expo-file-system` `File`
 * object. Both must end up handing the same bytes to Supabase Storage.
 */

const platform = vi.hoisted(() => ({ OS: "web" as "web" | "ios" | "android" }));
const fileCtor = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());

vi.mock("react-native", () => ({ Platform: platform }));

vi.mock("expo-file-system", () => ({
  File: class {
    constructor(uri: string) {
      fileCtor(uri);
    }
    size = 5;
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array([1, 2, 3, 4, 5]);
    }
  },
}));

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
  }),
}));

import { uploadFile } from "./upload";

const baseInput = {
  bucket: "task-media" as const,
  userId: "11111111-1111-4111-8111-111111111111",
  scopeId: "22222222-2222-4222-8222-222222222222",
};

beforeEach(() => {
  fileCtor.mockReset();
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ error: null });
});

describe("uploadFile local-file read is platform-aware", () => {
  it("reads bytes via fetch on web without constructing expo-file-system File", async () => {
    platform.OS = "web";
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn().mockResolvedValue({
      blob: async () => ({
        size: bytes.byteLength,
        arrayBuffer: async () => bytes.buffer,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await uploadFile({
      ...baseInput,
      file: {
        uri: "blob:http://localhost/abc",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 0,
        kind: "image",
      },
    });

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("blob:http://localhost/abc");
    expect(fileCtor).not.toHaveBeenCalled();
    if (outcome.ok) expect(outcome.object.sizeBytes).toBe(3);
    // The exact bytes read from the blob are what Supabase receives.
    const body = uploadMock.mock.calls[0]![1];
    expect(Array.from(body as Uint8Array)).toEqual([9, 8, 7]);

    vi.unstubAllGlobals();
  });

  it("uses the expo-file-system File API on native", async () => {
    platform.OS = "ios";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await uploadFile({
      ...baseInput,
      file: {
        uri: "file:///var/mobile/photo.jpg",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 0,
        kind: "image",
      },
    });

    expect(outcome.ok).toBe(true);
    expect(fileCtor).toHaveBeenCalledWith("file:///var/mobile/photo.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
    if (outcome.ok) expect(outcome.object.sizeBytes).toBe(5);
    const body = uploadMock.mock.calls[0]![1];
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3, 4, 5]);

    vi.unstubAllGlobals();
  });
});
