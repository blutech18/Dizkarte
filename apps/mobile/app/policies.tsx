import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { ProfilePageIntro, ProfilePageSection } from "../src/components/profile/ProfilePageSection";
import { Icon } from "../src/components/ui/Icon";
import { theme, spacing, fontSize, lineHeight, radii } from "../src/theme";

export default function PoliciesScreen() {
  return (
    <Screen subPageTitle="Policies & guidelines">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <ProfilePageIntro
          title="Policies & guidelines"
          description="Community standards, safety rules, insurance terms, and legal information governing the Dizkarte platform."
        />

        {/* Pending notice */}
        <View style={styles.pendingNotice}>
          <View style={styles.noticeHeader}>
            <Icon name="alert-circle" size={18} color={theme.warningOnSoft} />
            <Text style={styles.noticeTitle}>Pending publication</Text>
          </View>
          <Text style={styles.noticeDescription}>
            The documents below are under legal review and will be published before the platform
            launches publicly. The content shown here is informational only and not final.
          </Text>
        </View>

        {/* Community guidelines */}
        <ProfilePageSection icon="user" title="Community guidelines" showDivider={false}>
          <Text style={styles.body}>
            All users are expected to communicate respectfully, deliver on agreed terms, and refrain
            from harassment, discrimination, or fraudulent activity. Violations may result in
            suspension or permanent removal from the platform.
          </Text>
          <View style={styles.statusRow}>
            <Icon name="clock" size={14} color={theme.textSecondary} />
            <Text style={styles.statusText}>Full document — pending publication</Text>
          </View>
        </ProfilePageSection>

        {/* Safety */}
        <ProfilePageSection icon="shield" title="Safety rules" showDivider={false}>
          <Text style={styles.body}>
            Personal addresses and contact details are only shared with your confirmed booking
            counterpart after payment is secured. Never share payment credentials or work outside
            the platform to retain dispute protection.
          </Text>
          <View style={styles.statusRow}>
            <Icon name="clock" size={14} color={theme.textSecondary} />
            <Text style={styles.statusText}>Full document — pending publication</Text>
          </View>
        </ProfilePageSection>

        {/* Insurance */}
        <ProfilePageSection icon="briefcase" title="Insurance terms" showDivider={false}>
          <Text style={styles.body}>
            Platform insurance coverage details, eligibility criteria, and claims procedures will
            be published here before public launch. Coverage is subject to the terms agreed at
            the time of each booking.
          </Text>
          <View style={styles.statusRow}>
            <Icon name="clock" size={14} color={theme.textSecondary} />
            <Text style={styles.statusText}>Full document — pending publication</Text>
          </View>
        </ProfilePageSection>

        {/* Legal */}
        <ProfilePageSection
          icon="note"
          title="Legal — Terms of service & Privacy policy"
          showDivider={false}
        >
          <Text style={styles.body}>
            By using Dizkarte you agree to our Terms of Service and Privacy Policy. These govern
            how your data is stored, how disputes are resolved, and the rights and responsibilities
            of both clients and taskers on the platform.
          </Text>
          <View style={styles.statusRow}>
            <Icon name="clock" size={14} color={theme.textSecondary} />
            <Text style={styles.statusText}>Full document — pending publication</Text>
          </View>
        </ProfilePageSection>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  pendingNotice: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: theme.warningSoft,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: theme.warningOnSoft,
  },
  noticeDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.warningOnSoft,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontStyle: "italic",
  },
});
