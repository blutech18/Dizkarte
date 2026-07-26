import { StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { useSession } from "../../src/providers/SessionProvider";
import { theme, spacing, fontSize, radii } from "../../src/theme";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

const VERIFICATION_LABEL: Record<
  string,
  { label: string; tone: "success" | "warning" | "error" | "neutral" }
> = {
  DRAFT: { label: "Not submitted", tone: "neutral" },
  SUBMITTED: { label: "Submitted — awaiting review", tone: "warning" },
  IN_REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Verified", tone: "success" },
  REJECTED: { label: "Rejected", tone: "error" },
  RESUBMISSION_REQUIRED: { label: "Resubmission required", tone: "warning" },
};

export default function ProfileScreen() {
  const { session, signOut } = useSession();

  if (!session) return null;
  const verification = VERIFICATION_LABEL[session.verificationStatus] ?? VERIFICATION_LABEL.DRAFT;

  return (
    <Screen>
      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(session.displayName)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {session.displayName}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {session.email}
          </Text>
          {session.synthetic ? (
            <View style={styles.synthRow}>
              <StatusBadge tone="warning" label="Development account" />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity verification</Text>
        <StatusBadge tone={verification!.tone} label={verification!.label} />
        <Link href="/verification" asChild>
          <Button
            label={session.verificationStatus === "DRAFT" ? "Start verification" : "View status"}
            onPress={() => {}}
            variant="secondary"
          />
        </Link>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your profile</Text>
        <Link href="/profile/edit" asChild>
          <Button label="Edit profile" onPress={() => {}} variant="secondary" fullWidth />
        </Link>
        <Link href="/settings" asChild>
          <Button label="Preferences" onPress={() => {}} variant="secondary" fullWidth />
        </Link>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <Link href="/support" asChild>
          <Button label="Help & safety" onPress={() => {}} variant="secondary" fullWidth />
        </Link>
      </View>

      <Button
        label="Sign out"
        variant="destructive"
        onPress={async () => {
          await signOut();
          router.replace("/(auth)/welcome");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surfaceBrand,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.onPrimary, fontSize: fontSize.xl, fontWeight: "800" },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.xl, fontWeight: "800", color: theme.textPrimary },
  email: { fontSize: fontSize.sm, color: theme.textSecondary },
  synthRow: { flexDirection: "row", marginTop: spacing.xs },
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
});
