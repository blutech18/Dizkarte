import { StyleSheet, Text, View } from "react-native";
import { Switch } from "react-native";
import { createTaskSchema } from "@dizkarte/domain";
import { TextField } from "../ui/TextField";
import { CategoryPicker } from "./CategoryPicker";

import { theme, spacing, fontSize, radii } from "../../theme";
import type { DraftTaskInput, TaskMediaAttachment } from "../../services/marketplace/types";

export type TaskDraftFormValue = {
  readonly categoryId: string | null;
  readonly title: string;
  readonly description: string;
  readonly budget: string;
  readonly scheduledFor: string;
  readonly sameDay: boolean;
  readonly landmark: string;
  readonly exactAddress: string;
  readonly media: ReadonlyArray<TaskMediaAttachment>;
};

export const EMPTY_TASK_DRAFT_FORM: TaskDraftFormValue = {
  categoryId: null,
  title: "",
  description: "",
  budget: "",
  scheduledFor: "",
  sameDay: false,
  landmark: "",
  exactAddress: "",
  media: [],
};

export function draftFormFromInput(draft: DraftTaskInput): TaskDraftFormValue {
  return {
    categoryId: draft.categoryId,
    title: draft.title,
    description: draft.description,
    budget: (draft.budgetCentavos / 100).toFixed(2),
    scheduledFor: draft.scheduledFor ?? "",
    sameDay: draft.sameDay,
    landmark: draft.landmark,
    exactAddress: draft.exactAddress,
    media: draft.media,
  };
}

const DEFAULT_CITY_CODE = "137404";
const DEFAULT_BARANGAY_CODE = "137404001";
const DEFAULT_APPROX_LAT = 14.657;
const DEFAULT_APPROX_LNG = 121.032;
const DEFAULT_EXACT_LAT = 14.6575;
const DEFAULT_EXACT_LNG = 121.0322;

/** Validate + normalize a form value into a `DraftTaskInput`, or return field errors. */
export function validateTaskDraftForm(
  form: TaskDraftFormValue,
): { ok: true; draft: DraftTaskInput } | { ok: false; errors: Record<string, string> } {
  const budgetCentavos = Math.round(Number(form.budget.replace(/[^\d.]/g, "")) * 100);
  const scheduledForIso = normalizeSchedule(form.scheduledFor);
  const parsed = createTaskSchema.safeParse({
    categoryId: form.categoryId ?? "",
    title: form.title,
    description: form.description,
    budgetCentavos: Number.isFinite(budgetCentavos) ? budgetCentavos : -1,
    scheduledFor: scheduledForIso ?? undefined,
    sameDay: form.sameDay,
    publicLocation: {
      cityCode: DEFAULT_CITY_CODE,
      barangayCode: DEFAULT_BARANGAY_CODE,
      landmark: form.landmark,
      approximateLat: DEFAULT_APPROX_LAT,
      approximateLng: DEFAULT_APPROX_LNG,
    },
    privateLocation: {
      exactAddress: form.exactAddress,
      exactLat: DEFAULT_EXACT_LAT,
      exactLng: DEFAULT_EXACT_LNG,
    },
    media: form.media.map((m) => ({ storagePath: `dev/${m.id}/${m.fileName}`, kind: m.kind })),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  return {
    ok: true,
    draft: {
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      description: parsed.data.description,
      budgetCentavos: parsed.data.budgetCentavos,
      scheduledFor: parsed.data.scheduledFor ?? null,
      sameDay: parsed.data.sameDay,
      landmark: parsed.data.publicLocation.landmark,
      cityCode: parsed.data.publicLocation.cityCode,
      barangayCode: parsed.data.publicLocation.barangayCode,
      approximateLat: parsed.data.publicLocation.approximateLat,
      approximateLng: parsed.data.publicLocation.approximateLng,
      exactAddress: parsed.data.privateLocation.exactAddress,
      exactLat: parsed.data.privateLocation.exactLat,
      exactLng: parsed.data.privateLocation.exactLng,
      media: form.media,
    },
  };
}

function normalizeSchedule(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) return trimmed; // let schema validation reject it
  return asDate.toISOString();
}

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
