import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { CenterDialogModal } from "../../src/components/ui/CenterDialogModal";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { createSignedUrl } from "../../src/services/storage/upload";
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
  const { repository, revision } = useMarketplace();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const userId = session?.userId ?? null;

  // Load the persisted avatar and resolve a short-lived signed URL to render it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void repository.getMyProfile(userId).then(async (profile) => {
      if (!active) return;
      if (profile?.avatarPath) {
        const url = await createSignedUrl("avatars", profile.avatarPath);
        if (active) setAvatarUri(url);
      } else {
        if (active) setAvatarUri(null);
      }
    });
    return () => {
      active = false;
    };
  }, [repository, userId, revision]);

  if (!session) return null;

  const isVerified = session.verificationStatus === "APPROVED";
  const verification = VERIFICATION_LABEL[session.verificationStatus] ?? {
    label: "Not verified",
    tone: "neutral" as const,
  };

  return (
    <Screen scroll={true}>
      <AppHeader title="Profile" subtitle="Account, verification & settings" />

      <View style={styles.contentContainer}>
        {/* Formal Identity Hero Card */}
        <View style={styles.identityCard}>
          <Pressable
            onPress={() => {
              if (avatarUri) {
                setShowPhotoModal(true);
              } else {
                router.push("/profile/edit");
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={avatarUri ? "View profile photo" : "Edit profile"}
            style={({ pressed }) => [
              styles.avatarContainer,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.96 }] } : null,
            ]}
          >
            <View style={styles.avatarRing}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  accessibilityLabel="Profile photo"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{initials(session.displayName)}</Text>
                </View>
              )}
            </View>
            <View style={styles.viewBadge}>
              <Icon name="eye" size={13} color={theme.primary} />
            </View>
          </Pressable>
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, { fontSize: fontSize.lg }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {session.displayName}
              </Text>
              {isVerified ? (
                <Icon name="check-circle" size={17} color={theme.onPrimary} />
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
              onPress={() => router.push("/policies")}
            />
          </View>
        </View>

        {/* Section 6: Sign Out */}
        <View style={styles.signOutCard}>
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

      {/* Full Profile Photo Viewer Modal */}
      <CenterDialogModal
        visible={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
      >
        <View style={styles.photoModalCard}>
          {/* Modal Header */}
          <View style={styles.photoModalHeader}>
            <Text style={styles.photoModalTitle}>Profile photo</Text>
            <Pressable
              onPress={() => setShowPhotoModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close photo viewer"
              style={({ pressed }) => [
                styles.photoModalCloseBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Icon name="close" size={18} color={theme.textPrimary} />
            </Pressable>
          </View>

          {/* Large Clean Photo View / Initials Fallback */}
          <View style={styles.photoModalImageWrapper}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.photoModalImage}
                resizeMode="cover"
                accessibilityLabel="Full profile photo"
              />
            ) : (
              <View style={styles.photoModalPlaceholder}>
                <View style={styles.photoModalInitialsCircle}>
                  <Text style={styles.photoModalInitialsText}>
                    {initials(session.displayName)}
                  </Text>
                </View>
                <Text style={styles.photoModalPlaceholderText}>
                  No profile photo uploaded
                </Text>
              </View>
            )}
          </View>

          {/* Modal Actions Footer */}
          <View style={styles.photoModalFooter}>
            <Button
              label={avatarUri ? "Edit profile" : "Add profile photo"}
              variant="secondary"
              icon={avatarUri ? "edit" : "camera"}
              onPress={() => {
                setShowPhotoModal(false);
                router.push("/profile/edit");
              }}
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
    gap: spacing.lg,
    backgroundColor: theme.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    elevation: 4,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  avatarContainer: {
    position: "relative",
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.45)",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.primaryPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: theme.onPrimary,
    fontSize: fontSize.xxl - 4,
    fontWeight: "800",
  },
  viewBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
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
    color: theme.onPrimary,
    flexShrink: 1,
  },
  email: {
    fontSize: fontSize.sm,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "500",
  },
  sectionCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  signOutCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
  photoModalCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    gap: spacing.md,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  photoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  photoModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalImageWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  photoModalImage: {
    width: "100%",
    height: "100%",
  },
  photoModalPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: theme.surfaceSubtle,
    padding: spacing.xl,
  },
  photoModalInitialsCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  photoModalInitialsText: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.onPrimary,
  },
  photoModalPlaceholderText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  photoModalFooter: {
    marginTop: spacing.xs,
  },
});
