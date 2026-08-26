import type { TaskMediaAttachment } from "../marketplace/types";
import { removeObject, uploadFile } from "./upload";

export type PendingTaskMediaUpload = {
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly kind: "image" | "video";
};

/**
 * Upload a staged task-media batch and return the exact attachment metadata
 * persisted by the repository. Partial batches are rolled back immediately so
 * a failed save never leaves new, unbound private objects behind.
 */
export async function uploadTaskMediaBatch(input: {
  readonly userId: string;
  readonly taskId: string;
  readonly files: ReadonlyArray<PendingTaskMediaUpload>;
}): Promise<ReadonlyArray<TaskMediaAttachment>> {
  const uploaded: TaskMediaAttachment[] = [];

  try {
    for (const file of input.files) {
      const outcome = await uploadFile({
        bucket: "task-media",
        userId: input.userId,
        scopeId: input.taskId,
        file,
      });
      if (!outcome.ok) throw new Error(outcome.message);

      uploaded.push({
        id: outcome.object.path,
        kind: file.kind,
        fileName: outcome.object.fileName,
        sizeBytes: outcome.object.sizeBytes,
        mimeType: outcome.object.mimeType,
        storagePath: outcome.object.path,
      });
    }
    return uploaded;
  } catch (error) {
    const cleanup = await removeTaskMediaObjects(uploaded);
    if (cleanup.failed.length > 0) {
      throw new Error(
        "Upload failed, and some temporary files could not be cleaned up. Please try again.",
      );
    }
    throw error;
  }
}

/** Remove task-media objects and report every failed item to the caller. */
export async function removeTaskMediaObjects(
  media: ReadonlyArray<Pick<TaskMediaAttachment, "storagePath">>,
): Promise<{
  readonly failed: ReadonlyArray<Pick<TaskMediaAttachment, "storagePath">>;
}> {
  const outcomes = await Promise.all(
    media.map(async (item) => ({
      item,
      removed: await removeObject("task-media", item.storagePath),
    })),
  );
  return {
    failed: outcomes.filter((outcome) => !outcome.removed).map((outcome) => outcome.item),
  };
}
