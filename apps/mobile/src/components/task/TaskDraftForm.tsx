import { StyleSheet, Switch, Text, View } from "react-native";
import { TextField } from "../ui/TextField";
import { CategoryPicker } from "./CategoryPicker";
import { theme, spacing, fontSize, radii } from "../../theme";
import type { TaskDraftFormValue } from "./taskDraftValue";

// The form value, its defaults, and its validation live in `taskDraftValue.ts`
// (no React Native imports) so they can be unit-tested and shared with the
// guided wizard. Re-exported here so existing callers keep one import site.
export {
  EMPTY_TASK_DRAFT_FORM,
  draftFormFromInput,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "./taskDraftValue";

export type TaskDraftFormProps = {
  readonly value: TaskDraftFormValue;
  readonly onChange: (next: TaskDraftFormValue) => void;
  readonly errors: Record<string, string>;
};

/**
 * Shared create/edit form body. Budget is entered in PHP and converted to
 * integer centavos on validation; public landmark and private exact address
 * are always presented as visually distinct, separately labeled sections.
 */
export function TaskDraftForm({ value, onChange, errors }: TaskDraftFormProps) {
  function set<K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <View>
      <CategoryPicker
        value={value.categoryId}
        onChange={(categoryId) => set("categoryId", categoryId)}
        {...(errors.categoryId ? { error: errors.categoryId } : {})}
      />
      <TextField
        label="Title"
        required
        value={value.title}
        onChangeText={(text) => set("title", text)}
        error={errors.title}
        maxLength={120}
      />
      <TextField
        label="Description"
        required
        multiline
        value={value.description}
        onChangeText={(text) => set("description", text)}
        error={errors.description}
        description="At least 20 characters. Explain what needs to be done."
      />
      <TextField
        label="Budget (PHP)"
        required
        value={value.budget}
        onChangeText={(text) => set("budget", text)}
        keyboardType="numeric"
        error={errors.budgetCentavos}
        description="Minimum ₱20.00. Stored as an exact integer centavo amount."
      />

      <View style={styles.scheduleRow}>
        <View style={styles.scheduleSwitchRow}>
          <Text style={styles.switchLabel}>Same-day task</Text>
          <Switch
            value={value.sameDay}
            onValueChange={(next) => set("sameDay", next)}
            accessibilityLabel="Same-day task"
            accessibilityRole="switch"
          />
        </View>
      </View>
      {!value.sameDay ? (
        <TextField
          label="Scheduled for"
          value={value.scheduledFor}
          onChangeText={(text) => set("scheduledFor", text)}
          error={errors.scheduledFor}
          description="ISO date/time, e.g. 2026-07-27T09:00:00+08:00. Leave blank if flexible."
        />
      ) : null}

      <View style={styles.locationSection}>
        <Text style={styles.locationTitle}>Public location</Text>
        <Text style={styles.locationCaption}>
          Shown to every Tasker browsing open tasks before a booking is confirmed.
        </Text>
        <TextField
          label="Public landmark"
          required
          value={value.landmark}
          onChangeText={(text) => set("landmark", text)}
          error={errors.landmark}
          description="e.g. 'Near SM North EDSA'. Never your exact address."
        />
      </View>

      <View style={[styles.locationSection, styles.privateSection]}>
        <Text style={styles.locationTitle}>Private exact address</Text>
        <Text style={styles.locationCaption}>
          Kept private. Only released to your selected Tasker after payment is confirmed.
        </Text>
        <TextField
          label="Exact address"
          required
          value={value.exactAddress}
          onChangeText={(text) => set("exactAddress", text)}
          error={errors.exactAddress}
        />
      </View>

      {/*
        No photo/video picker yet. Task media requires Supabase Storage upload
        (signed paths + moderation), which is not wired. Showing a picker that
        recorded placeholder filenames without uploading anything would look like
        a working feature and quietly lose the Client's photos.
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleRow: { marginBottom: spacing.sm },
  scheduleSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  switchLabel: { fontSize: fontSize.md, color: theme.textPrimary, fontWeight: "600" },
  locationSection: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  privateSection: {
    backgroundColor: theme.warningSoft,
  },
  locationTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  locationCaption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
});
