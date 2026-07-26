import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MEDIA_LIMITS } from "@dizkarte/config";
import { Button } from "../ui/Button";
import { AttachmentLabel } from "../ui/AttachmentLabel";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

export type PendingAttachment = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
};

/**
 * Deterministic development-only sample generators for chat media.
 *
 * No native file/camera picker library is wired into this pass (no new
 * dependency is justified for a picker whose only job here is to produce
 * clearly-fake metadata) — every "attachment" is a fixed, labeled sample
 * with a plausible size, mirroring the existing completion-evidence and
 * support-ticket attachment convention elsewhere in the app. Nothing is
 * ever actually read from disk or uploaded.
 */
const SAMPLE_IMAGE_SIZES_BYTES = [512_000, 2_400_000, 9_000_000] as const;
const SAMPLE_VIDEO_SIZES_BYTES = [8_000_000, 45_000_000, 120_000_000] as const;

let sampleCounter = 0;

function nextSampleImage(): PendingAttachment {
  sampleCounter += 1;
  const size = SAMPLE_IMAGE_SIZES_BYTES[sampleCounter % SAMPLE_IMAGE_SIZES_BYTES.length]!;
  return {
    id: `chat-media-${Date.now()}-${sampleCounter}`,
    kind: "image",
    fileName: `chat-photo-${sampleCounter}.jpg`,
    sizeBytes: size,
    mimeType: "image/jpeg",
  };
}

function nextSampleVideo(): PendingAttachment {
  sampleCounter += 1;
  const size = SAMPLE_VIDEO_SIZES_BYTES[sampleCounter % SAMPLE_VIDEO_SIZES_BYTES.length]!;
  return {
    id: `chat-media-${Date.now()}-${sampleCounter}`,
    kind: "video",
    fileName: `chat-clip-${sampleCounter}.mp4`,
    sizeBytes: size,
    mimeType: "video/mp4",
  };
}

export const MAX_CHAT_ATTACHMENTS = 5;

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

/**
 * Validates a proposed attachment list against the shared `MEDIA_LIMITS`
 * safeguard (MIME allow-list, per-item size ceiling, and total count) —
 * the same bounds `sendMessageSchema` enforces server-side, so the client
 * gate and the authoritative check agree.
 */
export function validateAttachments(attachments: ReadonlyArray<PendingAttachment>): string | null {
  if (attachments.length > MAX_CHAT_ATTACHMENTS) {
    return `You can attach at most ${MAX_CHAT_ATTACHMENTS} files per message.`;
  }
  for (const item of attachments) {
    const allowed =
      item.kind === "image"
        ? (MEDIA_LIMITS.allowedImageMimeTypes as ReadonlyArray<string>)
        : (MEDIA_LIMITS.allowedVideoMimeTypes as ReadonlyArray<string>);
    if (!allowed.includes(item.mimeType)) {
      return `${item.fileName} has an unsupported file type.`;
    }
    const maxBytes =
      item.kind === "image" ? MEDIA_LIMITS.maxImageBytes : MEDIA_LIMITS.maxVideoBytes;
    if (item.sizeBytes > maxBytes) {
      return `${item.fileName} is too large (max ${formatBytes(maxBytes)}).`;
    }
  }
  return null;
}

export type ChatMediaAttachmentPickerProps = {
  readonly attachments: ReadonlyArray<PendingAttachment>;
  readonly onChange: (next: ReadonlyArray<PendingAttachment>) => void;
  readonly disabled?: boolean;
};

/** Chat attachment picker + list with accessible name/type/size labels and removal. */
export function ChatMediaAttachmentPicker({
  attachments,
  onChange,
  disabled = false,
}: ChatMediaAttachmentPickerProps) {
  const [pickError, setPickError] = useState<string | null>(null);

  function addAttachment(next: PendingAttachment) {
    const candidate = [...attachments, next];
    const error = validateAttachments(candidate);
    if (error) {
      setPickError(error);
      return;
    }
    setPickError(null);
    onChange(candidate);
  }

  function removeAttachment(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
    setPickError(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.devLabel}>Development-only sample attachment picker</Text>
      <View style={styles.pickerRow}>
        <Button
          label="Add sample photo"
          onPress={() => addAttachment(nextSampleImage())}
          variant="secondary"
          disabled={disabled}
        />
        <Button
          label="Add sample video"
          onPress={() => addAttachment(nextSampleVideo())}
          variant="secondary"
          disabled={disabled}
        />
      </View>
      {pickError ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {pickError}
        </Text>
      ) : null}
      {attachments.length > 0 ? (
        <View style={styles.list} accessibilityRole="list">
          {attachments.map((item) => (
            <View key={item.id} style={styles.item}>
              <AttachmentLabel
                kind={item.kind}
                text={`${item.fileName} · ${item.mimeType} · ${formatBytes(item.sizeBytes)}`}
                accessibilityLabel={`${item.kind === "image" ? "Image" : "Video"} attachment ${item.fileName}, ${item.mimeType}, ${formatBytes(item.sizeBytes)}`}
              />
              <Pressable
                onPress={() => removeAttachment(item.id)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove attachment ${item.fileName}`}
                style={styles.removeButton}
              >
                <Text style={styles.removeLabel}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  devLabel: { fontSize: fontSize.xs, color: theme.textSecondary, fontStyle: "italic" },
  pickerRow: { flexDirection: "row", gap: spacing.sm },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  list: { gap: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  removeButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  removeLabel: { color: theme.errorOnSoft, fontWeight: "600", fontSize: fontSize.xs },
});
