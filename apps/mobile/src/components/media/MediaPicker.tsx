import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { MAX_TASK_MEDIA_COUNT } from "../../services/storage/object-paths";
import { removeObject, uploadFile, type UploadedObject } from "../../services/storage/upload";
import type { StorageBucket, UploadKind } from "../../services/storage/object-paths";
import { theme, spacing, fontSize, radii } from "../../theme";

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
  /**
   * Which allow-list a picked photo is checked against.
   *
   * Defaults to `"image"`. Use `"document"` for identity documents: the
   * `verification_documents` table only accepts JPEG, PNG, or PDF, so a WebP
   * would pass the looser image check and then be rejected by the database with
   * a message the user cannot act on.
   */
  readonly photoUploadKind?: Extract<UploadKind, "image" | "document">;
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
  photoUploadKind = "image",
}: MediaPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `maxCount` defaults to the shared task-media ceiling, so callers with a
  // tighter limit (chat, single-document uploads) bind first.
  const atLimit = value.length >= maxCount;

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
          // The picker does not always report a size either; uploadFile reads
          // the real one off disk.
          sizeBytes: asset.fileSize ?? 0,
          kind: kind === "video" ? "video" : photoUploadKind,
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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {value.length > 0 ? (
        <View style={styles.list}>
          {value.map((item) => (
            <View key={item.path} style={styles.row}>
              <View style={styles.iconBadge}>
                <Icon
                  name={item.kind === "video" ? "video" : "image"}
                  size={14}
                  color={theme.primary}
                />
              </View>
              <View style={styles.itemMeta}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.fileName}
                </Text>
                <Text style={styles.itemType}>
                  {item.kind === "video" ? "Video attachment" : "Photo attachment"}
                </Text>
              </View>
              <Pressable
                onPress={() => void remove(item)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.fileName}`}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.removeButton,
                  pressed ? { opacity: 0.7, transform: [{ scale: 0.92 }] } : null,
                ]}
                disabled={disabled || busy}
              >
                <Icon name="close" size={13} color={theme.textSecondary} />
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
        <View style={styles.actionBtn}>
          <Button
            label={busy ? "Uploading…" : "Add photo"}
            icon="image"
            variant="secondary"
            onPress={() => void pick("image")}
            loading={busy}
            disabled={disabled || atLimit}
            fullWidth
            {...(atLimit ? { accessibilityHint: `Maximum ${maxCount} files.` } : {})}
          />
        </View>
        {allowVideo ? (
          <View style={styles.actionBtn}>
            <Button
              label="Add video"
              icon="video"
              variant="secondary"
              onPress={() => void pick("video")}
              disabled={disabled || busy || atLimit}
              fullWidth
            />
          </View>
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
  list: { gap: spacing.xs + 2, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowName: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  itemType: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actions: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  actionBtn: { flex: 1, minWidth: 0 },
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

