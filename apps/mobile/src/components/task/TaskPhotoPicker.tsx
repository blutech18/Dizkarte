import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MEDIA_LIMITS } from "@dizkarte/config";
import { Button } from "../ui/Button";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import { Icon } from "../ui/Icon";
import { theme, spacing, fontSize, radii } from "../../theme";

export type PendingTaskPhoto = {
  readonly id: string;
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
};

export type TaskPhotoPickerProps = {
  readonly value: ReadonlyArray<PendingTaskPhoto>;
  readonly onChange: (next: ReadonlyArray<PendingTaskPhoto>) => void;
  readonly disabled?: boolean;
};

/**
 * Local task-photo picker used before a task id exists.
 *
 * The hardened `task-media` storage policy only accepts objects whose path
 * names a real task owned by the uploader. Creation therefore keeps the picked
 * files locally (with real thumbnails) and uploads them after the task row is
 * created on final submit. This component never fabricates storage paths.
 */
export function TaskPhotoPicker({ value, onChange, disabled = false }: TaskPhotoPickerProps) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MEDIA_LIMITS.maxTaskMediaCount - value.length;
  const atLimit = remaining <= 0;

  function append(assets: ReadonlyArray<ImagePicker.ImagePickerAsset>) {
    const now = Date.now();
    const next = assets.slice(0, remaining).map((asset, index): PendingTaskPhoto => {
      const fallbackName = `task-photo-${now}-${index + 1}.jpg`;
      return {
        id: `${asset.assetId ?? asset.uri}-${now}-${index}`,
        uri: asset.uri,
        fileName: asset.fileName ?? fallbackName,
        mimeType: asset.mimeType ?? "image/jpeg",
        sizeBytes: asset.fileSize ?? 0,
        width: asset.width,
        height: asset.height,
      };
    });
    onChange([...value, ...next]);
  }

  async function chooseFromLibrary() {
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
      if (!result.canceled) append(result.assets);
    } catch {
      setError("Could not open your photo library. Please try again.");
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
      if (!result.canceled) append(result.assets);
    } catch {
      setError("Could not open the camera. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={styles.grid}>
        {value.map((photo, index) => (
          <View key={photo.id} style={styles.tile}>
            <Image
              source={{ uri: photo.uri }}
              style={styles.thumbnail}
              resizeMode="cover"
              accessibilityLabel={`Task photo ${index + 1}`}
            />
            <Pressable
              style={({ pressed }) => [
                styles.removeButton,
                pressed ? styles.removeButtonPressed : null,
              ]}
              onPress={() => onChange(value.filter((item) => item.id !== photo.id))}
              disabled={disabled || busy}
              accessibilityRole="button"
              accessibilityLabel={`Remove task photo ${index + 1}`}
              hitSlop={6}
            >
              <Icon name="close" size={13} color={theme.onPrimary} />
            </Pressable>
          </View>
        ))}

        {!atLimit ? (
          <Pressable
            style={({ pressed }) => [styles.addTile, pressed ? styles.addTilePressed : null]}
            onPress={() => setSourceOpen(true)}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityLabel="Add task photos"
            accessibilityState={{ disabled: disabled || busy, busy }}
          >
            <View style={[styles.addContent, { pointerEvents: "none" }]}>
              <Icon name="plus" size={26} color={theme.primary} />
              <Text style={styles.addLabel}>{busy ? "Opening…" : "Add photo"}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.counter}>
          {value.length} of {MEDIA_LIMITS.maxTaskMediaCount} selected
        </Text>
        <Text style={styles.uploadNote}>Uploaded securely when you post</Text>
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
            Add a task photo
          </Text>
          <Text style={styles.dialogHint}>Choose where the photo should come from.</Text>
          <View style={styles.dialogActions}>
            <Button label="Take a photo" icon="camera" onPress={() => void takePhoto()} fullWidth />
            <Button
              label="Choose from library"
              icon="image"
              variant="secondary"
              onPress={() => void chooseFromLibrary()}
              fullWidth
            />
            <Button label="Cancel" variant="text" onPress={() => setSourceOpen(false)} fullWidth />
          </View>
        </View>
      </CenterDialogModal>
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
  addTile: {
    width: 112,
    height: 112,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surfaceSubtle,
    position: "relative",
  },
  addContent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  addTilePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  addLabel: {
    fontSize: fontSize.xs,
    color: theme.primary,
    fontWeight: "700",
    width: "100%",
    textAlign: "center",
  },
  statusRow: {
    marginTop: spacing.sm,
    gap: 2,
  },
  counter: {
    fontSize: fontSize.xs,
    color: theme.textPrimary,
    fontWeight: "600",
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
