import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";
import { AnimatedFilterPressable, AnimatedFilterText } from "./AnimatedFilterPressable";
import { Icon } from "./Icon";

/**
 * Shared building blocks for every filter bottom sheet (discovery, My Tasks,
 * Bookings).
 *
 * Extracted so the three sheets cannot drift apart: before this, each sheet
 * carried its own copy of the section header, choice chip, and date field, so a
 * spacing or accessibility fix had to be repeated three times to stay
 * consistent.
 */

export function FilterSheetHeader({
  title,
  description,
  onClose,
  closeAccessibilityLabel,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly closeAccessibilityLabel: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.headerDescription}>{description}</Text>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeAccessibilityLabel}
        style={({ pressed }) => [styles.closeButton, pressed ? styles.closeButtonPressed : null]}
      >
        <Icon name="close" size={18} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

export function FilterSectionHeader({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
    </View>
  );
}

/** Inline "Reset"/"Clear" affordance for a single section. */
export function FilterSectionAction({
  label,
  accessibilityLabel,
  onPress,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.sectionAction, pressed ? styles.sectionActionPressed : null]}
    >
      <Text style={styles.sectionActionText}>{label}</Text>
    </Pressable>
  );
}

export function FilterChoice({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <AnimatedFilterPressable
      selected={selected}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      selectionAccessibilityState="checked"
      style={styles.choice}
      inactiveBackgroundColor={theme.surface}
      selectedBackgroundColor={theme.primary}
      inactiveBorderColor={theme.borderControl}
      selectedBorderColor={theme.primary}
      disabledBackgroundColor={theme.disabledBackground}
      disabledBorderColor={theme.borderSubtle}
    >
      <AnimatedFilterText
        style={styles.choiceText}
        inactiveColor={theme.textPrimary}
        selectedColor={theme.onPrimary}
        disabled={disabled}
        disabledColor={theme.disabledForeground}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </AnimatedFilterText>
    </AnimatedFilterPressable>
  );
}

/**
 * Choice chip carrying a live result count.
 *
 * The count is part of the accessible label rather than decoration, so a
 * screen-reader user hears "Drafts, 3 tasks" instead of two unrelated strings.
 */
export function FilterCountChoice({
  label,
  count,
  unit,
  icon,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly count: number;
  /** Singular noun, pluralized with a trailing "s". */
  readonly unit: string;
  readonly icon?: Parameters<typeof Icon>[0]["name"];
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <AnimatedFilterPressable
      selected={selected}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${count} ${unit}${count === 1 ? "" : "s"}`}
      selectionAccessibilityState="checked"
      style={styles.countChoice}
      inactiveBackgroundColor={theme.surface}
      selectedBackgroundColor={theme.primarySoft}
      inactiveBorderColor={theme.borderControl}
      selectedBorderColor={theme.primary}
      pressScale={0.97}
    >
      <View style={styles.countChoiceLeft}>
        {icon ? (
          <Icon name={icon} size={16} color={selected ? theme.primary : theme.textSecondary} />
        ) : null}
        <AnimatedFilterText
          style={styles.countChoiceLabel}
          inactiveColor={theme.textPrimary}
          selectedColor={theme.primaryPressed}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {label}
        </AnimatedFilterText>
      </View>
      <View style={[styles.countBadge, selected ? styles.countBadgeSelected : null]}>
        <Text style={[styles.countText, selected ? styles.countTextSelected : null]}>{count}</Text>
      </View>
    </AnimatedFilterPressable>
  );
}

export function FilterSwitchRow({
  title,
  description,
  value,
  onValueChange,
}: {
  readonly title: string;
  readonly description?: string;
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      // The compact chip has no room for the description, but a screen-reader
      // user still needs to know what the toggle does, so it becomes the hint.
      {...(description ? { accessibilityHint: description } : {})}
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.switchField,
        value ? styles.switchFieldSelected : null,
        pressed ? styles.switchFieldPressed : null,
      ]}
    >
      <Text
        style={[styles.switchFieldTitle, value ? styles.switchFieldTitleSelected : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {title}
      </Text>
      <View style={styles.switchWrapper}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
          accessibilityRole="switch"
          trackColor={{ false: theme.borderControl, true: theme.primary }}
          thumbColor={Platform.OS === "android" ? (value ? theme.onPrimary : theme.surface) : undefined}
          ios_backgroundColor={theme.borderControl}
          style={styles.switchControl}
        />
      </View>
    </Pressable>
  );
}

export function DateFilterField({
  label,
  value,
  emptyLabel,
  error,
  onPress,
}: {
  readonly label: string;
  readonly value: string;
  readonly emptyLabel: string;
  readonly error?: string | undefined;
  readonly onPress: () => void;
}) {
  const displayValue = value ? formatFriendlyDate(value) : emptyLabel;
  return (
    <View style={styles.dateField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayValue}`}
        accessibilityHint="Opens a calendar"
        style={({ pressed }) => [
          styles.dateButton,
          error ? styles.dateButtonError : null,
          pressed ? styles.dateButtonPressed : null,
        ]}
      >
        <View style={styles.dateButtonContent}>
          <Icon name="calendar" size={18} color={value ? theme.primary : theme.textSecondary} />
          <Text
            style={[styles.dateButtonText, value ? styles.dateButtonTextSelected : null]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {displayValue}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={theme.textSecondary} />
      </Pressable>
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function FilterHint({ text }: { readonly text: string }) {
  return (
    <View style={styles.inlineHint}>
      <Icon name="map-pin" size={17} color={theme.infoOnSoft} />
      <Text style={styles.inlineHintText}>{text}</Text>
    </View>
  );
}

/** `YYYY-MM-DD` -> local `Date`, or null when the value is not a real date. */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatFriendlyDate(value: string): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return "Choose a date";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const filterSheetStyles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  lastSection: { paddingBottom: 0, borderBottomWidth: 0 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choiceGroups: { gap: spacing.sm },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  fieldColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0 },
  filterField: { marginBottom: 0 },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  footerAction: { flex: 1, minWidth: 0 },
  footerActionSecondary: { flex: 1, minWidth: 0 },
  footerActionPrimary: { flex: 1.35, minWidth: 0 },
  handleBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  handlePill: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.borderControl },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { fontSize: fontSize.lg, fontWeight: "800", color: theme.textPrimary },
  headerDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  closeButtonPressed: { opacity: 0.72, transform: [{ scale: 0.95 }] },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitleRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    lineHeight: 24,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  sectionDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  sectionAction: {
    height: 28,
    minHeight: 28,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radii.sm,
  },
  sectionActionPressed: { backgroundColor: theme.surfaceSubtle },
  sectionActionText: { color: theme.primary, fontSize: fontSize.sm, fontWeight: "700" },
  choice: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "47%",
    minWidth: 0,
    height: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  choiceText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
    textAlign: "center",
  },
  countChoice: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "47%",
    minWidth: 0,
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  countChoiceLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  countChoiceLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  countBadgeSelected: { backgroundColor: theme.surface },
  countText: { fontSize: 10, fontWeight: "800", color: theme.textSecondary },
  countTextSelected: { color: theme.primary },
  switchField: {
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  switchFieldSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  switchFieldPressed: {
    opacity: 0.85,
  },
  switchFieldTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  switchFieldTitleSelected: {
    color: theme.primary,
  },
  switchWrapper: {
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  switchControl: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    margin: 0,
  },
  dateField: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  dateButton: {
    height: 48,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  dateButtonError: { borderColor: theme.errorSolid },
  dateButtonPressed: { opacity: 0.9, backgroundColor: theme.surfaceSubtle },
  dateButtonContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateButtonText: { flex: 1, minWidth: 0, fontSize: fontSize.sm, color: theme.textSecondary },
  dateButtonTextSelected: { color: theme.textPrimary, fontWeight: "700" },
  fieldError: { fontSize: fontSize.xs, color: theme.errorOnSoft },
  inlineHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: theme.infoSoft,
  },
  inlineHintText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.infoOnSoft,
  },
});

