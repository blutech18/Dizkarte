import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "../ui/TextField";
import { Icon, type IconName } from "../ui/Icon";
import { CategoryPicker } from "./CategoryPicker";
import { LocationSearchModal, locationSelectionToDraftPatch } from "./LocationSearchModal";
import { LocalityPicker } from "./LocalityPicker";
import { TaskSchedulePicker } from "./TaskSchedulePicker";
import { theme, spacing, fontSize, lineHeight, radii, MIN_TOUCH_TARGET } from "../../theme";
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
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);

  function set<K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <View style={styles.sections}>
      <FormSection
        icon="note"
        title="Task information"
        subtitle="Keep the title concise and describe the work clearly."
      >
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
          placeholder="What needs to be done?"
        />
        <TextField
          label="Description"
          required
          multiline
          value={value.description}
          onChangeText={(text) => set("description", text)}
          error={errors.description}
          description="Include the scope, access details, tools, and anything Taskers should know."
          placeholder="Describe the task in at least 20 characters."
          maxLength={4000}
        />
        <TextField
          label="Budget in pesos"
          required
          value={value.budget}
          onChangeText={(text) => set("budget", text)}
          keyboardType="numeric"
          error={errors.budgetCentavos}
          description="Enter your starting budget. You can still negotiate before accepting an offer."
          placeholder="0.00"
        />
      </FormSection>

      <FormSection
        icon="calendar"
        title="Schedule"
        subtitle="Choose whether the task is urgent, dated, or flexible."
      >
        <TaskSchedulePicker
          sameDay={value.sameDay}
          scheduledFor={value.scheduledFor}
          onChange={(next) => onChange({ ...value, ...next })}
        />
        {errors.scheduledFor ? (
          <Text style={styles.scheduleError} accessibilityRole="alert">
            {errors.scheduledFor}
          </Text>
        ) : null}
      </FormSection>

      <FormSection
        icon="map-pin"
        title="Location"
        subtitle="Separate the public area from the private address."
      >
        <View style={styles.visibilityBlock}>
          <View style={styles.visibilityHeader}>
            <Icon name="globe" size={18} color={theme.textSecondary} />
            <Text style={styles.visibilityTitle}>Public area</Text>
          </View>
          <Text style={styles.visibilityCaption}>
            Visible to every Tasker before a booking is confirmed.
          </Text>
        </View>
        <Pressable
          onPress={() => setLocationSearchOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            value.landmark ? `Change location: ${value.landmark}` : "Choose task location"
          }
          accessibilityHint="Search for an address or use your current GPS location"
          style={({ pressed }) => [
            styles.locationSelect,
            value.landmark ? styles.locationSelectChosen : null,
            errors.landmark || errors.exactAddress ? styles.locationSelectError : null,
            pressed ? styles.locationSelectPressed : null,
          ]}
        >
          <View style={styles.locationSelectText}>
            <View style={styles.locationSelectHeader}>
              <Icon name="map-pin" size={20} color={theme.primary} />
              <Text style={styles.locationSelectLabel}>Location</Text>
              <Icon name="chevron-right" size={18} color={theme.textSecondary} />
            </View>
            <Text style={value.landmark ? styles.locationValue : styles.locationPlaceholder}>
              {value.landmark || "Search for a location"}
            </Text>
            <Text style={styles.locationSelectHint}>Search an address or use current location</Text>
          </View>
        </Pressable>
        {errors.landmark ? (
          <Text style={styles.locationError} accessibilityRole="alert">
            {errors.landmark}
          </Text>
        ) : null}

        <View style={styles.privateAddress}>
          <View style={styles.visibilityBlock}>
            <View style={styles.visibilityHeader}>
              <Icon name="lock" size={18} color={theme.warningOnSoft} />
              <Text style={styles.privateTitle}>Private exact address</Text>
            </View>
            <Text style={styles.privateCaption}>
              Shared only with your selected Tasker after payment is confirmed.
            </Text>
          </View>
          <Text style={styles.privateAddressValue}>
            {value.exactAddress || "Choose a location to set the exact address."}
          </Text>
          {errors.exactAddress ? (
            <Text style={styles.privateError} accessibilityRole="alert">
              {errors.exactAddress}
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: spacing.md }}>
          <LocalityPicker
            value={{ cityCode: value.cityCode, barangayCode: value.barangayCode }}
            onChange={(next) =>
              onChange({ ...value, cityCode: next.cityCode, barangayCode: next.barangayCode })
            }
            cityRequired
            barangayRequired
          />
          {errors.cityCode ? (
            <Text style={styles.locationError} accessibilityRole="alert">
              {errors.cityCode}
            </Text>
          ) : null}
          {errors.barangayCode ? (
            <Text style={styles.locationError} accessibilityRole="alert">
              {errors.barangayCode}
            </Text>
          ) : null}
        </View>
      </FormSection>

      <LocationSearchModal
        visible={locationSearchOpen}
        onSelect={(selection) => {
          onChange({ ...value, ...locationSelectionToDraftPatch(selection) });
          setLocationSearchOpen(false);
        }}
        onClose={() => setLocationSearchOpen(false)}
      />
    </View>
  );
}

function FormSection({
  icon,
  title,
  subtitle,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={20} color={theme.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.sectionDivider} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  sectionSubtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.md,
  },
  scheduleError: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  visibilityBlock: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  visibilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  visibilityTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  visibilityCaption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  locationSelect: {
    minHeight: MIN_TOUCH_TARGET + 12,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
  },
  locationSelectChosen: {
    borderColor: theme.primary,
    backgroundColor: theme.surface,
  },
  locationSelectError: {
    borderColor: theme.errorSolid,
  },
  locationSelectPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  locationSelectText: {
    width: "100%",
    gap: spacing.xs,
  },
  locationSelectHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  locationSelectLabel: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  locationValue: {
    width: "100%",
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  locationPlaceholder: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  locationSelectHint: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  locationError: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  privateAddress: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  privateTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.warningOnSoft,
  },
  privateCaption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.warningOnSoft,
  },
  privateAddressValue: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.warningOnSoft,
  },
  privateError: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
});
