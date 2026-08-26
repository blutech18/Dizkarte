import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MEDIA_LIMITS } from "@dizkarte/config";
import type { TaskMediaAttachment } from "../../services/marketplace/types";
import type { PendingTaskMediaUpload } from "../../services/storage/task-media-batch";
import { SignedImage } from "../media/SignedImage";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { theme, spacing, fontSize, radii } from "../../theme";

export type PendingTaskMedia = PendingTaskMediaUpload & {
  readonly id: string;
};

export function TaskMediaEditor({
  existing,
  pending,
  onExistingChange,
  onPendingChange,
  disabled = false,
}: {
  readonly existing: ReadonlyArray<TaskMediaAttachment>;
  readonly pending: ReadonlyArray<PendingTaskMedia>;
  readonly onExistingChange: (next: ReadonlyArray<TaskMediaAttachment>) => void;
  readonly onPendingChange: (next: ReadonlyArray<PendingTaskMedia>) => void;
  readonly disabled?: boolean;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = existing.length + pending.length;
  const remaining = MEDIA_LIMITS.maxTaskMediaCount - total;
  const atLimit = remaining <= 0;

  function appendAssets(
    assets: ReadonlyArray<ImagePicker.ImagePickerAsset>,
    kind: "image" | "video",
  ) {
    const now = Date.now();
    const additions = assets.slice(0, remaining).map((asset, index): PendingTaskMedia => {
      const extension = kind === "video" ? "mp4" : "jpg";
      return {
        id: `${asset.assetId ?? asset.uri}-${now}-${index}`,
        uri: asset.uri,
        fileName: asset.fileName ?? `task-${kind}-${now}-${index + 1}.${extension}`,
        mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
        sizeBytes: asset.fileSize ?? 0,
        kind,
      };
    });
    onPendingChange([...pending, ...additions]);
  }

  async function choosePhotos() {
    setSourceOpen(false);
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access in Settings to choose task photos.");
      return;
    }

    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (!result.canceled) appendAssets(result.assets, "image");
    } catch {
      setError("Could not open your photo library. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseVideo() {
    setSourceOpen(false);
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow media access in Settings to choose a task video.");
      return;
    }

    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
        allowsMultipleSelection: false,
      });
      if (!result.canceled) appendAssets(result.assets, "video");
    } catch {
      setError("Could not open your video library. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    setSourceOpen(false);
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access in Settings to take a task photo.");
      return;
    }

    setBusy(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled) appendAssets(result.assets, "image");
    } catch {
      setError("Could not open the camera. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={styles.grid}>
        {existing.map((media, index) => (
          <View key={`existing-${media.id}`} style={styles.tile}>
            {media.kind === "image" ? (
              <SignedImage
                bucket="task-media"
                path={media.storagePath}
                width={112}
                height={112}
                accessibilityLabel={`Existing task photo ${index + 1}`}
              />
            ) : (
              <MediaFallback kind="video" />
            )}
            <RemoveButton
              label={`Remove ${media.fileName}`}
              onPress={() => onExistingChange(existing.filter((item) => item.id !== media.id))}
              disabled={disabled || busy}
            />
            {media.kind === "video" ? <MediaTypeBadge label="Video" /> : null}
          </View>
        ))}

        {pending.map((media, index) => (
          <View key={`pending-${media.id}`} style={styles.tile}>
            {media.kind === "image" ? (
              <Image
                source={{ uri: media.uri }}
                style={styles.thumbnail}
                resizeMode="cover"
                accessibilityLabel={`New task photo ${index + 1}`}
              />
            ) : (
              <MediaFallback kind="video" />
            )}
            <RemoveButton
              label={`Remove ${media.fileName}`}
              onPress={() => onPendingChange(pending.filter((item) => item.id !== media.id))}
              disabled={disabled || busy}
            />
            <MediaTypeBadge label={media.kind === "video" ? "New video" : "New"} />
          </View>
        ))}

        {!atLimit ? (
          <Pressable
            style={({ pressed }) => [styles.addTile, pressed ? styles.addTilePressed : null]}
            onPress={() => setSourceOpen(true)}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityLabel="Add task photos or video"
            accessibilityState={{ disabled: disabled || busy, busy }}
          >
            <Icon name="plus" size={27} color={theme.primary} />
            <Text style={styles.addLabel}>{busy ? "Opening..." : "Add media"}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.status}>
        <Text style={styles.counter}>
          {total} of {MEDIA_LIMITS.maxTaskMediaCount} attached
        </Text>
        <Text style={styles.uploadNote}>New files upload securely when you save.</Text>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <CenterDialogModal
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        dismissible={!busy}
      >
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle} accessibilityRole="header">
            Add task media
          </Text>
          <Text style={styles.dialogHint}>Choose a photo source or attach one video.</Text>
          <View style={styles.dialogActions}>
            <Button label="Take a photo" icon="camera" onPress={() => void takePhoto()} fullWidth />
            <Button
              label="Choose photos"
              icon="image"
              variant="secondary"
              onPress={() => void choosePhotos()}
              fullWidth
            />
            <Button
              label="Choose video"
              icon="video"
              variant="secondary"
              onPress={() => void chooseVideo()}
              fullWidth
            />
            <Button label="Cancel" variant="text" onPress={() => setSourceOpen(false)} fullWidth />
          </View>
        </View>
      </CenterDialogModal>
    </View>
  );
}

function RemoveButton({
  label,
  onPress,
  disabled,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.removeButton, pressed ? styles.removeButtonPressed : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Icon name="close" size={13} color={theme.onPrimary} />
    </Pressable>
  );
}

function MediaFallback({ kind }: { readonly kind: "video" }) {
  return (
    <View style={styles.fallback}>
      <Icon name={kind} size={32} color={theme.primary} />
      <Text style={styles.fallbackText}>Video</Text>
    </View>
  );
}

function MediaTypeBadge({ label }: { readonly label: string }) {
  return (
    <View style={styles.typeBadge}>
      <Text style={styles.typeBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    width: 112,
    height: 112,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: theme.primarySoft,
  },
  fallbackText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },
  removeButton: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.errorSolid,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  removeButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.92 }],
  },
  typeBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: "rgba(3, 8, 21, 0.72)",
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.onPrimary,
  },
  addTile: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surfaceSubtle,
  },
  addTilePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  addLabel: {
    width: "100%",
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
    textAlign: "center",
  },
  status: {
    marginTop: spacing.sm,
    gap: 2,
  },
  counter: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  uploadNote: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  error: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: theme.errorSoft,
    color: theme.errorOnSoft,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  dialogTitle: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  dialogHint: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  dialogActions: {
    gap: spacing.sm,
  },
});
