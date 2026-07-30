import { describe, expect, it } from "vitest";

import {
  MAX_CHAT_ATTACHMENTS,
  validateChatMessageInput,
  type ChatMediaAttachmentInput,
} from "./chat-message-validation";

const SENDER = "10000000-0000-4000-8000-000000000002";

function attachment(overrides: Partial<ChatMediaAttachmentInput> = {}): ChatMediaAttachmentInput {
  return {
    kind: "image",
    fileName: "photo.jpg",
    sizeBytes: 500_000,
    mimeType: "image/jpeg",
    storagePath: `${SENDER}/conversation-1/photo.jpg`,
    ...overrides,
  };
}

describe("validateChatMessageInput", () => {
  it("accepts a text-only message and trims the body", () => {
    const result = validateChatMessageInput({ body: "  on my way  ", media: [] });
    expect(result).toEqual({ ok: true, body: "on my way" });
  });

  it("accepts an attachment-only message", () => {
    const result = validateChatMessageInput({ body: null, media: [attachment()] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toBeNull();
  });

  it("requires either text or an attachment", () => {
    expect(validateChatMessageInput({ body: "   ", media: [] }).ok).toBe(false);
  });

  it("caps the attachment count", () => {
    const media = Array.from({ length: MAX_CHAT_ATTACHMENTS + 1 }, (_, i) =>
      attachment({ fileName: `photo-${i}.jpg` }),
    );
    expect(validateChatMessageInput({ body: null, media }).ok).toBe(false);
  });

  describe("uploaded file reference", () => {
    it("rejects an attachment with no storage path", () => {
      // Metadata without a real object would render as an attachment the
      // recipient can never open.
      const result = validateChatMessageInput({
        body: null,
        media: [attachment({ storagePath: "  " })],
      });
      expect(result.ok).toBe(false);
    });

    it("rejects a traversing or absolute object key", () => {
      for (const storagePath of [`${SENDER}/../other/photo.jpg`, "/etc/passwd"]) {
        expect(validateChatMessageInput({ body: null, media: [attachment({ storagePath })] }).ok).toBe(
          false,
        );
      }
    });
  });

  it("rejects a MIME type that contradicts the declared kind", () => {
    const result = validateChatMessageInput({
      body: null,
      media: [attachment({ kind: "image", mimeType: "video/mp4" })],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the per-kind ceiling", () => {
    const result = validateChatMessageInput({
      body: null,
      media: [attachment({ sizeBytes: 10 * 1024 * 1024 + 1 })],
    });
    expect(result.ok).toBe(false);
  });
});
