import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme, radii, spacing, fontSize, MIN_TOUCH_TARGET } from "../../theme";
import { SYNTHETIC_CATEGORIES } from "../../services/marketplace/categories";

export type CategoryPickerProps = {
  readonly value: string | null;
  readonly onChange: (categoryId: string) => void;
  readonly error?: string;
};

/** Accessible single-select category list. Not a native `<select>` — RN has none. */
export function CategoryPicker({ value, onChange, error }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = SYNTHETIC_CATEGORIES.find((c) => c.id === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Category<Text style={styles.required}> *</Text>
      </Text>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Category: ${selected.name}` : "Choose a category"}
        accessibilityHint="Opens the list of task categories"
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        <Text style={selected ? styles.triggerText : styles.triggerPlaceholder}>
          {selected ? selected.name : "Choose a category"}
        </Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {open ? (
        <View style={styles.list} accessibilityRole="menu">
          {SYNTHETIC_CATEGORIES.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => {
                onChange(category.id);
                setOpen(false);
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={category.name}
              accessibilityState={{ selected: category.id === value }}
              style={({ pressed }) => [
                styles.item,
                category.id === value ? styles.itemSelected : null,
                pressed ? styles.itemPressed : null,
              ]}
            >
              <Text style={category.id === value ? styles.itemTextSelected : styles.itemText}>
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  required: { color: theme.errorSolid },
  trigger: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  triggerError: { borderColor: theme.errorSolid },
  triggerText: { color: theme.textPrimary, fontSize: fontSize.md },
  triggerPlaceholder: { color: theme.textSecondary, fontSize: fontSize.md },
  error: {
    fontSize: fontSize.xs,
    color: theme.errorOnSoft,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  list: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  itemSelected: { backgroundColor: theme.primarySoft },
  itemPressed: { backgroundColor: theme.surfaceSubtle },
  itemText: { color: theme.textPrimary, fontSize: fontSize.md },
  itemTextSelected: { color: theme.primaryPressed, fontSize: fontSize.md, fontWeight: "600" },
});
