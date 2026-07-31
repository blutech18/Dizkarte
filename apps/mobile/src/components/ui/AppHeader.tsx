import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { theme, spacing, fontSize, lineHeight, MIN_TOUCH_TARGET } from "../../theme";
import { Icon } from "./Icon";

export type AppHeaderProps = {
  readonly title: string;
  /** Optional short line under the title (e.g. a count or context hint). */
  readonly subtitle?: string;
  /** Optional trailing slot, e.g. a text button ("Preferences", "Mark all read"). */
  readonly action?: ReactNode;
  /** Whether to display the top brand navbar. Defaults to true. */
  readonly showLogo?: boolean;
};

/**
 * Shared top header used by every top-level screen.
 * Renders a website-style top header bar in brand purple with the logo on the
 * left and a profile avatar icon button on the right, followed by the page title.
 */
export function AppHeader({ title, subtitle, action, showLogo = true }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      {showLogo ? (
        <View style={styles.topNavbar}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
            source={require("../../../assets/text-icon-white.png")}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Dizkarte"
          />
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={({ pressed }) => [styles.profileButton, pressed ? styles.profileButtonPressed : null]}
          >
            <Icon name="user" size={22} color={theme.onPrimary} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  topNavbar: {
    backgroundColor: theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
  },
  brandLogo: {
    width: 110,
    height: 32,
  },
  profileButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  profileButtonPressed: {
    opacity: 0.7,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleGroup: {
    flexShrink: 1,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  action: {
    flexShrink: 0,
  },
});


