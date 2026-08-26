import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { VerificationDocumentRecord } from "../../services/marketplace/types";
import { removeObject, uploadFile, type UploadedObject } from "../../services/storage/upload";
import { SignedImage } from "../media/SignedImage";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { StatusBadge } from "../ui/StatusBadge";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";

type OperationOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function VerificationDocumentPicker({
  title,
  hint,
  icon,
  userId,
  caseId,
  document,
  onAttach,
  onRemove,
  disabled = false,
}: {
  readonly title: string;
  readonly hint: string;
  readonly icon: IconName;
  readonly userId: string;
  readonly caseId: string;
  readonly document: VerificationDocumentRecord | null;
  readonly onAttach: (object: UploadedObject) => Promise<OperationOutcome>;
  readonly onRemove: (document: VerificationDocumentRecord) => Promise<OperationOutcome>;
  readonly disabled?: boolean;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!document) setLocalPreview(null);
  }, [document]);

  async function uploadAsset(asset: ImagePicker.ImagePickerAsset) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await uploadFile({
        bucket: "id-documents",
        userId,
        scopeId: caseId,
        file: {
          uri: asset.uri,
          fileName: asset.fileName ?? `verification-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
          sizeBytes: asset.fileSize ?? 0,
          kind: "document",
        },
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      const attached = await onAttach(outcome.object);
      if (!attached.ok) {
        const cleaned = await removeObject(outcome.object.bucket, outcome.object.path);
        setError(
          cleaned
            ? attached.reason
            : `${attached.reason} The temporary upload also could not be cleaned up.`,
        );
        return;
      }
      setLocalPreview(asset.uri);
    } catch {
      setError("Could not attach that document. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto() {
    setSourceOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access in Settings to choose this document.");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (!result.canceled && result.assets[0]) {
        await uploadAsset(result.assets[0]);
      }
    } catch {
      setError("Could not open your photo library. Please try again.");
    }
  }

  async function takePhoto() {
    setSourceOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access in Settings to take this photo.");
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        await uploadAsset(result.assets[0]);
      }
    } catch {
      setError("Could not open the camera. Please try again.");
    }
  }

  async function removeDocument() {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      const removed = await onRemove(document);
      if (!removed.ok) {
        setError(removed.reason);
        return;
      }
      setLocalPreview(null);
      const cleaned = await removeObject("id-documents", document.storagePath);
      if (!cleaned) {
        setError(
          "The document was removed from your case, but its private file could not be cleaned up.",
        );
      }
    } catch {
      setError("Could not remove this document. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <Icon name={icon} size={22} color={theme.primary} />
            <Text style={styles.title}>{title}</Text>
          </View>
          <StatusBadge
            tone={document ? "success" : "neutral"}
            label={document ? "Added" : "Required"}
          />
        </View>
        <Text style={styles.hint}>{hint}</Text>
      </View>

      {document ? (
        <View style={styles.previewArea}>
          {localPreview ? (
            <Image
              source={{ uri: localPreview }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel={`${title} preview`}
            />
          ) : (
            <SignedImage
              bucket="id-documents"
              path={document.storagePath}
              width={180}
              height={120}
              accessibilityLabel={`${title} preview`}
            />
          )}
          <View style={styles.documentMeta}>
            <Icon name="check-circle" size={18} color={theme.successSolid} />
            <Text style={styles.documentMetaText}>Document securely attached</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyPreview}>
          {busy ? (
            <ActivityIndicator size="large" color={theme.primary} />
          ) : (
            <Icon name={icon} size={34} color={theme.textSecondary} />
          )}
          <Text style={styles.emptyText}>
            {busy ? "Uploading securely..." : "No document attached yet"}
          </Text>
        </View>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {document ? (
        <Button
          label="Remove document"
          variant="secondary"
          onPress={() => void removeDocument()}
          loading={busy}
          disabled={disabled}
          fullWidth
        />
      ) : (
        <Button
          label="Add document"
          icon="camera"
          variant="secondary"
          onPress={() => setSourceOpen(true)}
          disabled={disabled || busy}
          fullWidth
        />
      )}

      <CenterDialogModal
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        dismissible={!busy}
      >
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Add {title.toLowerCase()}</Text>
          <Text style={styles.dialogHint}>Take a new photo or choose one from your library.</Text>
          <View style={styles.dialogActions}>
            <Button label="Take a photo" icon="camera" onPress={() => void takePhoto()} fullWidth />
            <Button
              label="Choose from library"
              icon="image"
              variant="secondary"
              onPress={() => void choosePhoto()}
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
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  hint: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  previewArea: {
    alignItems: "center",
    gap: spacing.sm,
  },
  preview: {
    width: 180,
    height: 120,
    borderRadius: radii.md,
  },
  documentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  documentMetaText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.successSolid,
  },
  emptyPreview: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  emptyText: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  error: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: theme.errorSoft,
    color: theme.errorOnSoft,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
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
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  dialogActions: {
    gap: spacing.sm,
  },
});
