import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { CenterDialogModal } from "../../src/components/ui/CenterDialogModal";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { uploadFile, createSignedUrl } from "../../src/services/storage/upload";
import { theme, spacing, fontSize, radii, lineHeight } from "../../src/theme";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

const VERIFICATION_LABEL: Record<
  string,
  { label: string; tone: "success" | "warning" | "error" | "neutral" }
> = {
  DRAFT: { label: "Not verified", tone: "neutral" },
  SUBMITTED: { label: "Awaiting review", tone: "warning" },
  IN_REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Verified Identity", tone: "success" },
  REJECTED: { label: "Verification rejected", tone: "error" },
  RESUBMISSION_REQUIRED: { label: "Resubmission required", tone: "warning" },
};

type ProfileMenuItemProps = {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly badge?: { label: string; tone: "success" | "warning" | "error" | "neutral" } | undefined;
  readonly onPress: () => void;
  readonly isDestructive?: boolean | undefined;
};

function ProfileMenuItem({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  isDestructive = false,
}: ProfileMenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.menuRow,
        isDestructive ? styles.menuRowDestructive : null,
        pressed ? styles.menuRowPressed : null,
      ]}
    >
      <View style={[styles.menuIconBox, isDestructive ? styles.menuIconBoxDestructive : null]}>
        <Icon name={icon} size={18} color={isDestructive ? theme.errorSolid : theme.primary} />
      </View>
      <View style={styles.menuTextGroup}>
        <Text
          style={[
            styles.menuTitle,
            { minWidth: 0, fontSize: fontSize.md - 1 },
            isDestructive ? styles.menuTitleDestructive : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.88}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {/*
        Badge + chevron are grouped in their own fixed-size, non-shrinking
        cluster so they always sit flush against the row's right edge —
        previously they were loose siblings of `menuTextGroup`, so a longer
        subtitle (forced to a single line) would visually crowd them instead
        of the text simply wrapping to a second line underneath.
      */}
      <View style={styles.menuTrailing}>
        {badge ? <StatusBadge tone={badge.tone} label={badge.label} /> : null}
        <Icon
          name="arrow-right"
          size={16}
          color={isDestructive ? theme.errorSolid : theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useSession();
  const { repository } = useMarketplace();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const userId = session?.userId ?? null;

  // Load the persisted avatar and resolve a short-lived signed URL to render it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void repository.getMyProfile(userId).then(async (profile) => {
      if (!active || !profile?.avatarPath) return;
      const url = await createSignedUrl("avatars", profile.avatarPath);
      if (active && url) setAvatarUri(url);
    });
    return () => {
      active = false;
    };
  }, [repository, userId]);

  if (!session) return null;

  const isVerified = session.verificationStatus === "APPROVED";
  const verification = VERIFICATION_LABEL[session.verificationStatus] ?? {
    label: "Not verified",
    tone: "neutral" as const,
  };

  const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg"];

  async function pickProfilePhoto() {
    if (!session || uploadingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Allow photo access in your device settings to upload a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    // Validate MIME type — only PNG, JPG, JPEG allowed
    const mime = asset.mimeType?.toLowerCase() ?? "";
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      Alert.alert("Unsupported format", "Please select a PNG or JPG image for your profile photo.");
      return;
    }

    // Upload to the private `avatars` bucket, then persist the object path on
    // the profile. The local URI is shown immediately for feedback and rolled
    // back if either step fails, so the avatar never shows an image that was
    // not actually saved.
    const previousUri = avatarUri;
    setUploadingAvatar(true);
    setAvatarUri(asset.uri);

    const uploaded = await uploadFile({
      bucket: "avatars",
      userId: session.userId,
      scopeId: "profile",
      file: {
        uri: asset.uri,
        fileName: asset.fileName ?? "avatar.jpg",
        mimeType: mime,
        sizeBytes: asset.fileSize ?? 0,
        kind: "image",
      },
    });
    if (!uploaded.ok) {
      setAvatarUri(previousUri);
      setUploadingAvatar(false);
      Alert.alert("Upload failed", uploaded.message);
      return;
    }

    const saved = await repository.updateMyProfile(session.userId, {
      avatarPath: uploaded.object.path,
    });
    setUploadingAvatar(false);
    if (!saved.ok) {
      setAvatarUri(previousUri);
      Alert.alert("Could not save photo", saved.message);
    }
  }

  return (
    <Screen scroll={true}>
      <AppHeader title="Profile" subtitle="Account, verification & settings" />

      <View style={styles.contentContainer}>
        {/* Formal Identity Hero Card */}
        <View style={[styles.identityCard, { padding: spacing.md }]}>
          <Pressable
            onPress={() => void pickProfilePhoto()}
            disabled={uploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={({ pressed }) => [
              styles.avatarContainer,
              pressed ? { opacity: 0.8, transform: [{ scale: 0.95 }] } : null,
            ]}
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                accessibilityLabel="Profile photo"
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(session.displayName)}</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={styles.avatarUploading}>
                <ActivityIndicator color={theme.onPrimary} />
              </View>
            ) : null}
            <View style={styles.cameraBadge}>
              <Icon name="image" size={12} color={theme.onPrimary} />
            </View>
          </Pressable>
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, { minWidth: 0, flex: 1, fontSize: fontSize.lg }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {session.displayName}
              </Text>
              {isVerified ? (
                <Icon name="check-circle" size={18} color={theme.successSolid} />
              ) : null}
            </View>
            <Text style={[styles.email, { fontSize: fontSize.xs + 1 }]} numberOfLines={1}>
              {session.email}
            </Text>
          </View>
        </View>

        {/* Section 1: Identity & Verification */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Identity & Verification</Text>
            {!isVerified ? (
              <StatusBadge tone={verification.tone} label={verification.label} />
            ) : null}
          </View>
          <View style={styles.menuGroup}>
            <ProfileMenuItem
              icon="shield"
              title="Identity verification"
              subtitle={
                isVerified ? "Government ID verified" : "Submit documents to verify account"
              }
              onPress={() => router.push("/verification")}
            />
            <View style={styles.divider} />
            <ProfileMenuItem
              icon="user"
              title="Edit profile"
              subtitle="Update your name, bio, and specialties"
              onPress={() => router.push("/profile/edit")}
            />
          </View>
        </View>

        {/* Section 2: Work & Earnings */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Work & Earnings</Text>
          <View style={styles.menuGroup}>
            <ProfileMenuItem
              icon="wallet"
              title="Earnings & payouts"
              subtitle="Balance, withdrawals, and your offer history"
              onPress={() => router.push("/earnings")}
            />
            <View style={styles.divider} />
            <ProfileMenuItem
              icon="image"
              title="Manage portfolio"
              subtitle="Work samples shown on your public Tasker profile"
              onPress={() => router.push("/portfolio")}
            />
          </View>
        </View>

        {/* Section 3: Payments */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Payments</Text>
          <View style={styles.menuGroup}>
            <ProfileMenuItem
              icon="note"
              title="Payment history"
              subtitle="What you have earned and what you have paid"
              onPress={() => router.push("/payments")}
            />
            <View style={styles.divider} />
            <ProfileMenuItem
              icon="bank"
              title="Payout & billing details"
              subtitle="Mobile number, bank account, and billing address"
              onPress={() => router.push("/finish-registration")}
            />
          </View>
        </View>

        {/* Section 4: Preferences & System */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Preferences & System</Text>
          <View style={styles.menuGroup}>
            <ProfileMenuItem
              icon="bell"
              title="Notifications"
              subtitle="Configure push and email alerts"
              onPress={() => router.push("/notification-preferences")}
            />
            <View style={styles.divider} />
            <ProfileMenuItem
              icon="filter"
              title="General settings"
              subtitle="App preferences and location defaults"
              onPress={() => router.push("/settings")}
            />
          </View>
        </View>

        {/* Section 5: Support & Safety */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Support & Safety</Text>
          <View style={styles.menuGroup}>
            <ProfileMenuItem
              icon="note"
              title="Help & support"
              subtitle="Browse FAQs and contact customer care"
              onPress={() => router.push("/support")}
            />
            <View style={styles.divider} />
            {/*
              Community guidelines, insurance, and legal terms are Client-owned
              documents that have not been published yet. This entry leads to the
              same guidance surface that states so plainly, rather than shipping
              placeholder text dressed up as policy.
            */}
            <ProfileMenuItem
              icon="shield"
              title="Policies & guidelines"
              subtitle="Community, safety, insurance and legal — pending publication"
              onPress={() => router.push("/support")}
            />
          </View>
        </View>

        {/* Section 6: Sign Out */}
        <View style={styles.sectionCard}>
          <ProfileMenuItem
            icon="log-out"
            title="Sign out"
            isDestructive
            onPress={() => setShowSignOutModal(true)}
          />
        </View>
      </View>

      {/* Sign Out Confirmation Modal */}
      <CenterDialogModal
        visible={showSignOutModal}
        onClose={() => !isLoggingOut && setShowSignOutModal(false)}
        dismissible={!isLoggingOut}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalIconBox}>
            <Icon name="log-out" size={24} color={theme.errorSolid} />
          </View>
          <Text style={styles.modalTitle}>Sign out?</Text>
          <Text style={styles.modalMessage}>
            Are you sure you want to sign out of your Dizkarte account?
          </Text>
          <View style={styles.modalActions}>
            <Button
              label="Sign out"
              variant="primary"
              loading={isLoggingOut}
              onPress={async () => {
                setIsLoggingOut(true);
                try {
                  await signOut();
                  setShowSignOutModal(false);
                  router.replace("/(auth)/welcome");
                } catch {
                  setIsLoggingOut(false);
                }
              }}
              fullWidth
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isLoggingOut}
              onPress={() => setShowSignOutModal(false)}
              fullWidth
            />
          </View>
        </View>
      </CenterDialogModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surfaceBrand,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatarContainer: {
    position: "relative",
    width: 64,
    height: 64,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatarUploading: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.surface,
  },
  avatarText: {
    color: theme.onPrimary,
    fontSize: fontSize.xxl - 4,
    fontWeight: "800",
  },
  identityText: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
    flexShrink: 1,
  },
  email: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  sectionCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
    flexShrink: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  menuGroup: {
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  menuRowDestructive: {},
  menuRowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
    backgroundColor: theme.surfaceSubtle,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconBoxDestructive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  menuTextGroup: {
    flex: 1,
    gap: 2,
  },
  menuTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  menuTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  menuTitleDestructive: {
    color: theme.errorSolid,
  },
  menuSubtitle: {
    fontSize: fontSize.xs + 1,
    color: theme.textSecondary,
    lineHeight: lineHeight.xs,
  },
  divider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.xs,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  modalMessage: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  modalActions: {
    width: "100%",
    gap: spacing.sm,
  },
});
