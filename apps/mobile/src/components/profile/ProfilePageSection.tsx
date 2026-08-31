import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../ui/Icon";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../theme";

export function ProfilePageIntro({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  const { isCompactPhone, isNarrowPhone } = useResponsiveLayout();
  const responsiveTitleSize = isNarrowPhone
    ? fontSize.lg
    : isCompactPhone
      ? fontSize.xl - 2
      : fontSize.xl;

  return (
    <View style={styles.intro}>
      <Text
        style={[styles.introTitle, { fontSize: responsiveTitleSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text style={styles.introDescription}>{description}</Text>
    </View>
  );
}

export function ProfilePageSection({
  icon,
  title,
  description,
  trailing,
  children,
  tone = "default",
  showDivider = false,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description?: string;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly tone?: "default" | "danger";
  /** Use only when the section contains multiple fields, rows, or controls. */
  readonly showDivider?: boolean;
}) {
  const danger = tone === "danger";
  const { isCompactPhone } = useResponsiveLayout();

  return (
    <View
      style={[
        styles.card,
        isCompactPhone ? styles.cardCompact : null,
        danger ? styles.cardDanger : null,
      ]}
    >
      <View style={styles.header}>
        <Icon name={icon} size={21} color={danger ? theme.errorOnSoft : theme.primary} />
        <Text style={[styles.title, danger ? styles.titleDanger : null]}>{title}</Text>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {description ? (
        <Text style={[styles.description, danger ? styles.descriptionDanger : null]}>
          {description}
        </Text>
      ) : null}
      {showDivider ? (
        <View style={[styles.divider, danger ? styles.dividerDanger : null]} />
      ) : (
        <View style={styles.contentGap} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    minWidth: 0,
    gap: spacing.xs,
  },
  introTitle: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  introDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  card: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardCompact: {
    padding: spacing.md,
  },
  cardDanger: {
    backgroundColor: theme.errorSoft,
    borderColor: "rgba(180, 35, 59, 0.22)",
  },
  header: {
    minHeight: 24,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    minWidth: 0,
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  titleDanger: {
    color: theme.errorOnSoft,
  },
  trailing: {
    flexShrink: 0,
  },
  description: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  descriptionDanger: {
    color: theme.errorOnSoft,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
    backgroundColor: theme.borderSubtle,
  },
  dividerDanger: {
    backgroundColor: "rgba(180, 35, 59, 0.18)",
  },
  contentGap: {
    height: spacing.md,
  },
});
