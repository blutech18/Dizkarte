import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { canAddTaskMedia, MAX_TASK_MEDIA_COUNT } from "../../services/storage/object-paths";
import { removeObject, uploadFile, type UploadedObject } from "../../services/storage/upload";
import type { StorageBucket } from "../../services/storage/object-paths";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

export type MediaPickerProps = {
  readonly bucket: StorageBucket;
  readonly userId: string;
  /** Record the files belong to: task id, case id, conversation id, booking id. */
  readonly scopeId: string;
  readonly value: ReadonlyArray<UploadedObject>;
  readonly onChange: (next: ReadonlyArray<UploadedObject>) => void;
  readonly label?: string;
  readonly hint?: string;
  readonly allowVideo?: boolean;
  readonly maxCount?: number;
  readonly disabled?: boolean;
};

/**
 * Pick photos or video from the device and upload them to a private bucket.
 *
 * Files are uploaded immediately rather than held until submit: an upload is the
 * slow, failure-prone step, so doing it while the user is still on the screen
 * lets a failure be retried in context instead of losing the whole form. What
 * the parent receives is the stored object metadata, which is what the database
 * records.
 *
 * Removing an entry also deletes the uploaded object, so an abandoned attachment
 * does not linger in storage.
 */
export function MediaPicker({
  bucket,
  userId,
  scopeId,
  value,
  onChange,
  label = "Photos",
  hint,
  allowVideo = false,
  maxCount = MAX_TASK_MEDIA_COUNT,
  disabled = false,
}: MediaPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = value.length >= maxCount || !canAddTaskMedia(value.length);

  async function pick(kind: "image" | "video") {
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access in your device settings to attach files.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    setBusy(true);
    try {
      const outcome = await uploadFile({
        bucket,
        userId,
        scopeId,
        file: {
          uri: asset.uri,
          fileName: asset.fileName ?? `${kind}-${Date.now()}`,
          // The picker does not always report a MIME type; fall back to the
          // format the upload was requested as.
          mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
          sizeBytes: asset.fileSize ?? 0,
          kind,
        },
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      onChange([...value, outcome.object]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: UploadedObject) {
    onChange(value.filter((item) => item.path !== target.path));
    // Best effort: the row is already gone from the form, so a failed delete is
    // an orphaned object rather than a user-visible error.
    await removeObject(target.bucket, target.path);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {value.length > 0 ? (
        <View style={styles.list}>
          {value.map((item) => (
            <View key={item.path} style={styles.row}>
              <Icon name={item.kind === "video" ? "video" : "image"} size={18} color={theme.primary} />
              <Text style={styles.rowName} numberOfLines={1}>
                {item.fileName}
              </Text>
              <Pressable
                onPress={() => void remove(item)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.fileName}`}
                hitSlop={8}
                style={styles.removeButton}
                disabled={disabled || busy}
              >
                <Icon name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={busy ? "Uploading…" : "Add photo"}
          icon="image"
          variant="secondary"
          onPress={() => void pick("image")}
          loading={busy}
          disabled={disabled || atLimit}
          {...(atLimit ? { accessibilityHint: `Maximum ${maxCount} files.` } : {})}
        />
        {allowVideo ? (
          <Button
            label="Add video"
            icon="video"
            variant="secondary"
            onPress={() => void pick("video")}
            disabled={disabled || busy || atLimit}
          />
        ) : null}
      </View>

      <Text style={styles.counter}>
        {value.length} of {maxCount} attached
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: { fontSize: fontSize.xs, color: theme.textSecondary, marginBottom: spacing.sm },
  list: { gap: spacing.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
  },
  rowName: { flex: 1, fontSize: fontSize.sm, color: theme.textPrimary },
  removeButton: {
    width: MIN_TOUCH_TARGET - 12,
    height: MIN_TOUCH_TARGET - 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  error: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  counter: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
});
