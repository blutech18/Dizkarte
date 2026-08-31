import { StyleSheet, Text, View } from "react-native";
import { theme, radii } from "../../theme";
import { Icon, type IconName } from "./Icon";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

const TONE_COLORS: Record<BadgeTone, { background: string; text: string; dot: string; border: string }> = {
  neutral: {
    background: theme.surfaceSubtle,
    text: theme.textSecondary,
    dot: theme.textSecondary,
    border: theme.borderSubtle,
  },
  brand: {
    background: "rgba(109, 40, 217, 0.08)",
    text: theme.primary,
    dot: theme.primary,
    border: "rgba(109, 40, 217, 0.18)",
  },
  success: {
    background: "rgba(22, 163, 74, 0.08)",
    text: "#15803D",
    dot: "#16A34A",
    border: "rgba(22, 163, 74, 0.18)",
  },
  warning: {
    background: "rgba(217, 119, 6, 0.08)",
    text: "#B45309",
    dot: "#D97706",
    border: "rgba(217, 119, 6, 0.18)",
  },
  error: {
    background: "rgba(220, 38, 38, 0.08)",
    text: "#B91C1C",
    dot: "#DC2626",
    border: "rgba(220, 38, 38, 0.18)",
  },
  info: {
    background: "rgba(37, 99, 235, 0.08)",
    text: "#1D4ED8",
    dot: "#2563EB",
    border: "rgba(37, 99, 235, 0.18)",
  },
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
  const colors = TONE_COLORS[tone] ?? TONE_COLORS.neutral;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.badge,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={11} color={colors.text} />
      ) : (
        <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      )}
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
});

