import { MEDIA_LIMITS, TEXT_LIMITS } from "@dizkarte/config";

/**
 * Authoritative chat-message input validation.
 *
 * This mirrors `sendMessageSchema` (`@dizkarte/domain`) — same body bound,
 * same body-or-media requirement, same attachment count ceiling, same
 * kind-to-MIME allow-list, and the same per-kind byte ceiling from
 * `MEDIA_LIMITS` — shaped for the mobile port's attachment contract
 * (`kind`/`fileName`/`sizeBytes`/`mimeType`/`storagePath`).
 *
 * `SyntheticMarketplaceRepository.sendMessage` must call this and reject
 * invalid input *before* writing any message record, delivery-status
 * mutation, or notification — never trusting caller-supplied media metadata.
 */

export const MAX_CHAT_ATTACHMENTS = 5;

export type ChatMediaAttachmentInput = {
  readonly kind: "image" | "video";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  /**
   * Key of the already-uploaded object in the private `chat-media` bucket.
   *
   * The upload happened first, and the bucket policy required the path to start
   * with the uploader's own user id, so this is a reference to a real object
   * rather than caller-declared metadata.
   */
  readonly storagePath: string;
};

export type ChatMessageValidationResult =
  | { readonly ok: true; readonly body: string | null }
  | { readonly ok: false; readonly reason: string };

const MAX_FILENAME_LENGTH = 255;

function isValidAttachment(item: ChatMediaAttachmentInput): string | null {
  if (typeof item.fileName !== "string" || item.fileName.trim().length === 0) {
    return "Attachment file name is required.";
  }
  if (item.fileName.trim().length > MAX_FILENAME_LENGTH) {
    return "Attachment file name is too long.";
  }
  if (!Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0) {
    return "Attachment size must be a positive integer.";
  }
  const path = typeof item.storagePath === "string" ? item.storagePath.trim() : "";
  if (path.length === 0) {
    return "Attachment is missing its uploaded file reference.";
  }
  // Traversal in an object key would let a row point outside its own prefix.
  if (path.includes("..") || path.startsWith("/")) {
    return "Attachment file reference is not valid.";
  }
  const allowedMimeTypes: ReadonlyArray<string> =
    item.kind === "image"
      ? MEDIA_LIMITS.allowedImageMimeTypes
      : item.kind === "video"
        ? MEDIA_LIMITS.allowedVideoMimeTypes
        : [];
  if (item.kind !== "image" && item.kind !== "video") {
    return "Attachment kind must be image or video.";
  }
  if (!allowedMimeTypes.includes(item.mimeType)) {
    return `${item.fileName.trim()} has a MIME type not allowed for its kind.`;
  }
  const maxBytes = item.kind === "image" ? MEDIA_LIMITS.maxImageBytes : MEDIA_LIMITS.maxVideoBytes;
  if (item.sizeBytes > maxBytes) {
    return `${item.fileName.trim()} exceeds the maximum allowed size for its kind.`;
  }
  return null;
}

/**
 * Validates a send/retry message payload at the adapter boundary.
 *
 * Returns `{ ok: true, body }` with the trimmed, normalized body (or `null`
 * when absent) only if every rule passes. Returns `{ ok: false, reason }`
 * otherwise, and the caller must not write any state or notification.
 */
export function validateChatMessageInput(input: {
  readonly body: string | null | undefined;
  readonly media: ReadonlyArray<ChatMediaAttachmentInput>;
}): ChatMessageValidationResult {
  const rawBody = input.body ?? null;
  const trimmedBody = rawBody !== null ? rawBody.trim() : null;
  const normalizedBody = trimmedBody && trimmedBody.length > 0 ? trimmedBody : null;

  if (normalizedBody !== null && normalizedBody.length > TEXT_LIMITS.messageBodyMax) {
    return { ok: false, reason: `Message body exceeds ${TEXT_LIMITS.messageBodyMax} characters.` };
  }

  const media = input.media ?? [];
  if (normalizedBody === null && media.length === 0) {
    return { ok: false, reason: "A message must include text or at least one attachment." };
  }
  if (media.length > MAX_CHAT_ATTACHMENTS) {
    return {
      ok: false,
      reason: `A message may include at most ${MAX_CHAT_ATTACHMENTS} attachments.`,
    };
  }
  for (const item of media) {
    const error = isValidAttachment(item);
    if (error) return { ok: false, reason: error };
  }

  return { ok: true, body: normalizedBody };
}
