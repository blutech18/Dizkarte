import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { AttachmentLabel } from "../ui/AttachmentLabel";
import type { TaskMediaAttachment } from "../../services/marketplace/types";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

/**
 * Deterministic development-only sample media generators for task creation.
 *
 * No native file/camera picker library is wired into this pass. Every
 * "attachment" is a fixed, labeled sample with a plausible size — nothing is
 * ever actually read from disk or uploaded (mirrors the completion-evidence
 * and support-ticket attachment convention elsewhere in the app).
 */
let sampleCounter = 0;

function nextSampleImage(): TaskMediaAttachment {
  sampleCounter += 1;
  return {
    id: `task-media-${Date.now()}-${sampleCounter}`,
    kind: "image",
    fileName: `task-photo-${sampleCounter}.jpg`,
    sizeBytes: 1_200_000,
    mimeType: "image/jpeg",
  };
}

function nextSampleVideo(): TaskMediaAttachment {
  sampleCounter += 1;
  return {
    id: `task-media-${Date.now()}-${sampleCounter}`,
    kind: "video",
    fileName: `task-clip-${sampleCounter}.mp4`,
    sizeBytes: 15_000_000,
    mimeType: "video/mp4",
  };
}

export type MediaAttachmentPickerProps = {
  readonly media: ReadonlyArray<TaskMediaAttachment>;
  readonly onChange: (next: ReadonlyArray<TaskMediaAttachment>) => void;
};

/** Task creation media picker: deterministic sample photo/video attachments. */
export function MediaAttachmentPicker({ media, onChange }: MediaAttachmentPickerProps) {
  function addMedia(next: TaskMediaAttachment) {
    onChange([...media, next]);
  }

  function removeMedia(id: string) {
    onChange(media.filter((item) => item.id !== id));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Task media</Text>
      <View style={styles.pickerRow}>
        <Button
          label="Add sample photo"
          onPress={() => addMedia(nextSampleImage())}
          variant="secondary"
        />
        <Button
          label="Add sample video"
          onPress={() => addMedia(nextSampleVideo())}
          variant="secondary"
        />
      </View>
      {media.length === 0 ? (
        <Text style={styles.emptyText}>No media attached yet.</Text>
      ) : (
        <View style={styles.list}>
          {media.map((item) => (
            <View key={item.id} style={styles.item}>
              <AttachmentLabel kind={item.kind} text={item.fileName} />
              <Pressable
                onPress={() => removeMedia(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove attachment ${item.fileName}`}
                style={styles.removeButton}
              >
                <Text style={styles.removeLabel}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  pickerRow: { flexDirection: "row", gap: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: theme.textSecondary },
  list: { gap: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  removeButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  removeLabel: { color: theme.errorOnSoft, fontWeight: "600", fontSize: fontSize.xs },
});
