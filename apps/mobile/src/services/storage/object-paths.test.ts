import { describe, expect, it } from "vitest";
import {
  MAX_TASK_MEDIA_COUNT,
  buildObjectPath,
  canAddTaskMedia,
  isOwnedBy,
  safeFileName,
  validateUpload,
} from "./object-paths";

const USER = "94110566-40e6-4eed-88fe-3ca423c04b5c";
const TASK = "40876600-f3db-4a0a-89c8-b5b34ee2d473";

describe("safeFileName", () => {
  it("keeps a normal name, lowercased", () => {
    expect(safeFileName("Kitchen-Sink.JPG")).toBe("kitchen-sink.jpg");
  });

  it("strips directory components", () => {
    expect(safeFileName("photos/holiday/sink.jpg")).toBe("sink.jpg");
    expect(safeFileName("C:\\Users\\me\\sink.jpg")).toBe("sink.jpg");
  });

  it("neutralizes traversal sequences", () => {
    // A name that could climb out of the owner's folder must not survive.
    const result = safeFileName("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  it("replaces spaces and unsafe characters", () => {
    expect(safeFileName("my photo (1)!.png")).toBe("my-photo-1-.png");
  });

  it("falls back to a generic name when nothing usable remains", () => {
    expect(safeFileName("")).toBe("upload");
    expect(safeFileName("///")).toBe("upload");
  });

  it("bounds the length", () => {
    expect(safeFileName("a".repeat(400)).length).toBeLessThanOrEqual(100);
  });
});

describe("buildObjectPath", () => {
  it("puts the owner id first, as every bucket policy requires", () => {
    const path = buildObjectPath({ userId: USER, scopeId: TASK, fileName: "sink.jpg" });
    expect(path).toBe(`${USER}/${TASK}/sink.jpg`);
    expect(isOwnedBy(path, USER)).toBe(true);
  });

  it("keeps the owner segment even when the filename tries to escape", () => {
    const path = buildObjectPath({
      userId: USER,
      scopeId: TASK,
      fileName: "../../../other-user/secret.jpg",
    });
    expect(isOwnedBy(path, USER)).toBe(true);
    expect(path.split("/")).toHaveLength(3);
  });

  it("supports a uniquifier so duplicate names can coexist", () => {
    const a = buildObjectPath({ userId: USER, scopeId: TASK, fileName: "x.jpg", unique: "1" });
    const b = buildObjectPath({ userId: USER, scopeId: TASK, fileName: "x.jpg", unique: "2" });
    expect(a).not.toBe(b);
  });
});

describe("isOwnedBy", () => {
  it("rejects a path belonging to someone else", () => {
    expect(isOwnedBy(`${TASK}/${USER}/x.jpg`, USER)).toBe(false);
  });
});

describe("validateUpload", () => {
  it("accepts a normal photo", () => {
    expect(validateUpload({ kind: "image", mimeType: "image/jpeg", sizeBytes: 500_000 }).ok).toBe(
      true,
    );
  });

  it("rejects a disallowed type for the kind", () => {
    const result = validateUpload({ kind: "image", mimeType: "video/mp4", sizeBytes: 1000 });
    expect(result.ok).toBe(false);
  });

  it("rejects an oversized image but allows the same size as video", () => {
    const twentyMB = 20 * 1024 * 1024;
    expect(validateUpload({ kind: "image", mimeType: "image/png", sizeBytes: twentyMB }).ok).toBe(
      false,
    );
    expect(validateUpload({ kind: "video", mimeType: "video/mp4", sizeBytes: twentyMB }).ok).toBe(
      true,
    );
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ kind: "image", mimeType: "image/jpeg", sizeBytes: 0 }).ok).toBe(false);
  });

  it("accepts a PDF only as a document", () => {
    expect(
      validateUpload({ kind: "document", mimeType: "application/pdf", sizeBytes: 1000 }).ok,
    ).toBe(true);
    expect(validateUpload({ kind: "image", mimeType: "application/pdf", sizeBytes: 1000 }).ok).toBe(
      false,
    );
  });
});

describe("canAddTaskMedia", () => {
  it("allows up to the shared limit and no further", () => {
    expect(canAddTaskMedia(0)).toBe(true);
    expect(canAddTaskMedia(MAX_TASK_MEDIA_COUNT - 1)).toBe(true);
    expect(canAddTaskMedia(MAX_TASK_MEDIA_COUNT)).toBe(false);
  });
});
