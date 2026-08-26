import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../theme";
import {
  AnimatedFilterPressable,
  AnimatedFilterText,
  AnimatedFilterView,
} from "../ui/AnimatedFilterPressable";
import { BottomSheetModal } from "../ui/BottomSheetModal";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

export type MyTaskStatusFilter =
  | "all"
  | "draft"
  | "published"
  | "assigned"
  | "completed"
  | "closed";

export const MY_TASK_STATUS_FILTERS: ReadonlyArray<{
  readonly key: MyTaskStatusFilter;
  readonly label: string;
  readonly icon: IconName;
}> = [
  { key: "all", label: "All statuses", icon: "note" },
  { key: "draft", label: "Draft", icon: "edit" },
  { key: "published", label: "Published", icon: "briefcase" },
  { key: "assigned", label: "Assigned", icon: "user" },
  { key: "completed", label: "Completed", icon: "check-circle" },
  { key: "closed", label: "Closed", icon: "close" },
];

type TaskStatusFilterPanelProps = {
  readonly visible: boolean;
  readonly filter: MyTaskStatusFilter;
  readonly counts: Readonly<Record<MyTaskStatusFilter, number>>;
  readonly onApply: (filter: MyTaskStatusFilter) => void;
  readonly onClose: () => void;
};

/** Browse-style single-choice status filter for the client's owned task list. */
export function TaskStatusFilterPanel({
  visible,
  filter,
  counts,
  onApply,
  onClose,
}: TaskStatusFilterPanelProps) {
  const { isTablet } = useResponsiveLayout();
  const [draftFilter, setDraftFilter] = useState<MyTaskStatusFilter>(filter);

  // Closing cancels un-applied changes, matching the discovery filter sheet.
  useEffect(() => {
    if (visible) setDraftFilter(filter);
  }, [filter, visible]);

  const matchingCount = counts[draftFilter];

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.handleBar}>
        <View style={styles.handlePill} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} accessibilityRole="header">
            Filter tasks
          </Text>
          <Text style={styles.description}>Choose which task status you want to see.</Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close status filters"
          style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
        >
          <Icon name="close" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body} accessibilityRole="radiogroup">
        {MY_TASK_STATUS_FILTERS.map((item) => {
          const selected = draftFilter === item.key;
          return (
            <AnimatedFilterPressable
              key={item.key}
              selected={selected}
              onPress={() => setDraftFilter(item.key)}
              accessibilityRole="radio"
              accessibilityLabel={`${item.label}, ${counts[item.key]} task${counts[item.key] === 1 ? "" : "s"}`}
              selectionAccessibilityState="checked"
              style={[styles.option, isTablet ? styles.optionTablet : styles.optionPhone]}
              inactiveBackgroundColor={theme.surface}
              selectedBackgroundColor={theme.primarySoft}
              inactiveBorderColor={theme.borderControl}
              selectedBorderColor={theme.primary}
              pressScale={0.97}
            >
              <View style={styles.optionLeft}>
                <Icon
                  name={item.icon}
                  size={17}
                  color={selected ? theme.primary : theme.textSecondary}
                />
                <AnimatedFilterText
                  style={styles.optionLabel}
                  inactiveColor={theme.textPrimary}
                  selectedColor={theme.primaryPressed}
                  numberOfLines={1}
                >
                  {item.label}
                </AnimatedFilterText>
              </View>

              <AnimatedFilterView
                style={styles.countBadge}
                inactiveBackgroundColor={theme.surfaceSubtle}
                selectedBackgroundColor={theme.surface}
              >
                <AnimatedFilterText
                  style={styles.countText}
                  inactiveColor={theme.textSecondary}
                  selectedColor={theme.primary}
                >
                  {counts[item.key]}
                </AnimatedFilterText>
              </AnimatedFilterView>
            </AnimatedFilterPressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerAction}>
          <Button label="Clear" variant="secondary" onPress={() => onApply("all")} fullWidth />
        </View>
        <View style={styles.footerAction}>
          <Button
            label={`Show ${matchingCount} task${matchingCount === 1 ? "" : "s"}`}
            onPress={() => onApply(draftFilter)}
            fullWidth
          />
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  handleBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  handlePill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderControl,
  },
  header: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  description: {
    color: theme.textSecondary,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.xs + 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.95 }],
  },
  body: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.surfaceSubtle,
  },
  option: {
    minWidth: 0,
    minHeight: 48,
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  optionPhone: {
    flexBasis: "47%",
  },
  optionTablet: {
    flexBasis: "31%",
  },
  optionLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 3,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 24,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: radii.pill,
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  footerAction: {
    flex: 1,
    minWidth: 0,
  },
});
