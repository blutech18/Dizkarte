import { StyleSheet, Text, View } from "react-native";
import { theme, radii, spacing, fontSize } from "../../theme";
import { Icon, type IconName } from "./Icon";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

const TONE_COLORS: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: theme.surfaceSubtle, text: theme.textSecondary },
  brand: { background: theme.primarySoft, text: theme.primaryPressed },
  success: { background: theme.successSoft, text: theme.successOnSoft },
  warning: { background: theme.warningSoft, text: theme.warningOnSoft },
  error: { background: theme.errorSoft, text: theme.errorOnSoft },
  info: { background: theme.infoSoft, text: theme.infoOnSoft },
};

export type StatusBadgeProps = {
  readonly tone: BadgeTone;
  readonly label: string;
  /**
   * Optional fuller phrase for assistive tech (e.g. "Status: Open"). Defaults
   * to the visible label so the badge is always announced as a single unit.
   */
  readonly accessibilityLabel?: string;
  /** Optional leading real vector icon (never an emoji, e.g. a star rating). */
  readonly icon?: IconName;
};

/** Status is always literal text, never color-only (requirement R14). */
export function StatusBadge({ tone, label, accessibilityLabel, icon }: StatusBadgeProps) {
  const colors = TONE_COLORS[tone];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.badge, { backgroundColor: colors.background }]}
    >
      {icon ? <Icon name={icon} size={12} color={colors.text} /> : null}
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
});
