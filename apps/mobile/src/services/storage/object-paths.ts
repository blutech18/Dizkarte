import { MEDIA_LIMITS } from "@dizkarte/config";

/**
 * Storage object path construction and upload validation.
 *
 * Kept free of React Native and Supabase imports so the rules are unit-testable.
 *
 * Every bucket policy in `supabase/migrations/0010` gates writes on
 * `app.storage_owner(name) = auth.uid()::text`, which reads the FIRST path
 * segment. A path that does not begin with the uploader's own user id is
 * rejected by the database, so building it correctly is a security requirement,
 * not a convention.
 */

export const STORAGE_BUCKETS = [
  "id-documents",
  "task-media",
  "portfolios",
  "chat-media",
  "evidence",
] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export type UploadKind = "image" | "video" | "document";

/**
 * Reduce a user-supplied filename to something safe for an object key.
 *
 * Object names travel in URLs and are matched by `storage.foldername`, so path
 * separators, traversal sequences, and whitespace are stripped rather than
 * escaped. An empty result falls back to a generic name so a file is never
 * uploaded to a bare directory path.
 */
export function safeFileName(input: string): string {
  const base = input.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned.toLowerCase() : "upload";
}

/**
 * Build an owner-partitioned object path: `<userId>/<scopeId>/<name>`.
 *
 * `scopeId` groups files by the record they belong to (task, case, conversation,
 * booking), which is what keeps one task's photos from colliding with another's.
 */
export function buildObjectPath(input: {
  readonly userId: string;
  readonly scopeId: string;
  readonly fileName: string;
  /** Optional uniquifier so two files with the same name can coexist. */
  readonly unique?: string;
}): string {
  const name = safeFileName(input.fileName);
  const prefix = input.unique ? `${input.unique}-` : "";
  return `${input.userId}/${input.scopeId}/${prefix}${name}`;
}

/** True when the path's first segment is the given user, i.e. the policy will allow it. */
export function isOwnedBy(path: string, userId: string): boolean {
  return path.split("/")[0] === userId;
}

export type UploadValidationResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

function allowedMimeTypes(kind: UploadKind): ReadonlyArray<string> {
  switch (kind) {
    case "image":
      return MEDIA_LIMITS.allowedImageMimeTypes;
    case "video":
      return MEDIA_LIMITS.allowedVideoMimeTypes;
    case "document":
      return MEDIA_LIMITS.allowedDocumentMimeTypes;
  }
}

function maxBytes(kind: UploadKind): number {
  return kind === "video" ? MEDIA_LIMITS.maxVideoBytes : MEDIA_LIMITS.maxImageBytes;
}

function describeBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Check a file against the shared media limits before any bytes are sent.
 *
 * Rejecting locally is a courtesy, not the boundary — object size and type are
 * also constrained by the bucket configuration — but it turns a failed upload
 * into an immediate, readable message.
 */
export function validateUpload(input: {
  readonly kind: UploadKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
}): UploadValidationResult {
  const allowed = allowedMimeTypes(input.kind);
  if (!allowed.includes(input.mimeType)) {
    return {
      ok: false,
      message: `That file type is not supported. Allowed: ${allowed
        .map((type) => type.split("/")[1])
        .join(", ")}.`,
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, message: "That file appears to be empty." };
  }
  const limit = maxBytes(input.kind);
  if (input.sizeBytes > limit) {
    return { ok: false, message: `That file is too large. Maximum ${describeBytes(limit)}.` };
  }
  return { ok: true };
}

/** Whether another file may be added to a task, per the shared media count limit. */
export function canAddTaskMedia(currentCount: number): boolean {
  return currentCount < MEDIA_LIMITS.maxTaskMediaCount;
}

export const MAX_TASK_MEDIA_COUNT = MEDIA_LIMITS.maxTaskMediaCount;
