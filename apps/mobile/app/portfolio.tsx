import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { Icon } from "../src/components/ui/Icon";
import { StatusBadge, type BadgeTone } from "../src/components/ui/StatusBadge";
import { LoadingState, ErrorState, EmptyState, DeniedState } from "../src/components/ui/AsyncState";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import { uploadFile, createSignedUrl } from "../src/services/storage/upload";
import type { PortfolioItemRecord } from "../src/services/marketplace";
import { theme, spacing, fontSize, radii, lineHeight } from "../src/theme";

type LoadState = "loading" | "loaded" | "error";
type PortfolioTile = PortfolioItemRecord & { readonly url: string | null };

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg"];

const MODERATION_TONE: Record<PortfolioItemRecord["moderationStatus"], BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
  HIDDEN: "neutral",
};

const MODERATION_LABEL: Record<PortfolioItemRecord["moderationStatus"], string> = {
  PENDING: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  HIDDEN: "Hidden",
};

/**
 * Tasker portfolio manager.
 *
 * Work samples live in the private `portfolios` bucket, owner-partitioned, and
 * are rendered through short-lived signed URLs — never a public URL. New uploads
 * enter moderation as PENDING; only APPROVED items are ever shown to clients on
 * the public Tasker profile.
 */
export default function PortfolioScreen() {
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const userId = session?.userId ?? null;

  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ReadonlyArray<PortfolioTile>>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setState("loading");
    setError(null);
    try {
      const records = await repository.listMyPortfolio(userId);
      const tiles = await Promise.all(
        records.map(async (record) => ({
          ...record,
          url: await createSignedUrl("portfolios", record.storagePath),
        })),
      );
      setItems(tiles);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [repository, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!userId || uploading) return;
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Allow photo access in your device settings to add portfolio samples.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const mime = asset.mimeType?.toLowerCase() ?? "";
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      setError("Please choose a PNG or JPG image.");
      return;
    }

    setUploading(true);
    const uploaded = await uploadFile({
      bucket: "portfolios",
      userId,
      scopeId: "portfolio",
      file: {
        uri: asset.uri,
        fileName: asset.fileName ?? "portfolio.jpg",
        mimeType: mime,
        sizeBytes: asset.fileSize ?? 0,
        kind: "image",
      },
    });
    if (!uploaded.ok) {
      setUploading(false);
      setError(uploaded.message);
      return;
    }
    const saved = await repository.addPortfolioItem(userId, {
      storagePath: uploaded.object.path,
    });
    setUploading(false);
    if (!saved.ok) {
      setError(saved.reason ?? "Could not save that sample.");
      return;
    }
    notifyChanged();
    await load();
  }, [userId, uploading, repository, notifyChanged, load]);

  const handleRemove = useCallback(
    (item: PortfolioTile) => {
      if (!userId) return;
      Alert.alert("Remove sample", "Remove this portfolio sample?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const result = await repository.removePortfolioItem(userId, item.id);
            if (!result.ok) {
              setError("Could not remove that sample. Try again.");
              return;
            }
            notifyChanged();
            await load();
          },
        },
      ]);
    },
    [userId, repository, notifyChanged, load],
  );

  if (!session) {
    return <DeniedState description="Sign in to manage your portfolio." />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={true} subPageTitle="Portfolio">
        <Text style={styles.intro}>
          Add photos of your best work. New samples are reviewed before clients can see them on your
          public Tasker profile.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={theme.errorOnSoft} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={uploading ? "Uploading…" : "Add a work sample"}
          icon="plus"
          onPress={() => void handleAdd()}
          loading={uploading}
          fullWidth
        />

        {state === "loading" ? <LoadingState label="Loading your portfolio" /> : null}
        {state === "error" ? <ErrorState onRetry={() => void load()} /> : null}
        {state === "loaded" && items.length === 0 ? (
          <EmptyState
            title="No samples yet"
            description="Add a few photos of completed work to build client trust."
          />
        ) : null}

        {state === "loaded" && items.length > 0 ? (
          <View style={styles.grid}>
            {items.map((item) => (
              <View key={item.id} style={styles.tile}>
                {item.url ? (
                  <Image source={{ uri: item.url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Icon name="image" size={22} color={theme.textSecondary} />
                  </View>
                )}
                <View style={styles.tileFooter}>
                  <StatusBadge
                    tone={MODERATION_TONE[item.moderationStatus]}
                    label={MODERATION_LABEL[item.moderationStatus]}
                  />
                  <Pressable
                    onPress={() => handleRemove(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove sample"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.removeButton,
                      pressed ? { opacity: 0.6 } : null,
                    ]}
                  >
                    <Icon name="close" size={16} color={theme.errorOnSoft} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginBottom: spacing.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  errorText: { color: theme.errorOnSoft, fontSize: fontSize.sm, fontWeight: "600", flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  tile: {
    width: "47%",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: 130,
    backgroundColor: theme.surfaceSubtle,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  tileFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.errorSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
