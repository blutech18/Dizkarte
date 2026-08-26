import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  removeObject: vi.fn(),
}));

vi.mock("./upload", () => storageMocks);

import { removeTaskMediaObjects, uploadTaskMediaBatch } from "./task-media-batch";

const FILE = {
  uri: "file:///photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  kind: "image" as const,
};

describe("task media batch storage", () => {
  beforeEach(() => {
    storageMocks.uploadFile.mockReset();
    storageMocks.removeObject.mockReset();
  });

  it("returns repository-ready attachment metadata for a successful upload", async () => {
    storageMocks.uploadFile.mockResolvedValueOnce({
      ok: true,
      object: {
        bucket: "task-media",
        path: "client/task/photo.jpg",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1234,
        kind: "image",
      },
    });

    await expect(
      uploadTaskMediaBatch({
        userId: "client",
        taskId: "task",
        files: [FILE],
      }),
    ).resolves.toEqual([
      {
        id: "client/task/photo.jpg",
        kind: "image",
        fileName: "photo.jpg",
        sizeBytes: 1234,
        mimeType: "image/jpeg",
        storagePath: "client/task/photo.jpg",
      },
    ]);
  });

  it("rolls back an earlier object when a later upload fails", async () => {
    storageMocks.uploadFile
      .mockResolvedValueOnce({
        ok: true,
        object: {
          bucket: "task-media",
          path: "client/task/photo.jpg",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1234,
          kind: "image",
        },
      })
      .mockResolvedValueOnce({ ok: false, message: "Upload failed." });
    storageMocks.removeObject.mockResolvedValue(true);

    await expect(
      uploadTaskMediaBatch({
        userId: "client",
        taskId: "task",
        files: [FILE, { ...FILE, fileName: "photo-2.jpg" }],
      }),
    ).rejects.toThrow("Upload failed.");
    expect(storageMocks.removeObject).toHaveBeenCalledWith("task-media", "client/task/photo.jpg");
  });

  it("reports every object that storage refused to remove", async () => {
    storageMocks.removeObject.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      removeTaskMediaObjects([
        { storagePath: "client/task/one.jpg" },
        { storagePath: "client/task/two.jpg" },
      ]),
    ).resolves.toEqual({
      failed: [{ storagePath: "client/task/two.jpg" }],
    });
  });
});
