import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { formatPhp } from "@dizkarte/domain";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CategoryPicker } from "./CategoryPicker";
import { useCategories } from "../../providers/CategoriesProvider";
import {
  budgetToCentavos,
  canContinue,
  firstIncompleteStep,
  stepProgress,
  stepsFor,
  validateStep,
  type WizardStepId,
} from "./taskWizardSteps";
import type { TaskDraftFormValue } from "./taskDraftValue";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

export type TaskWizardProps = {
  readonly value: TaskDraftFormValue;
  readonly onChange: (next: TaskDraftFormValue) => void;
  /** True when a category was chosen before entering the flow. */
  readonly categoryPreselected: boolean;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
  /** Called when the user backs out of the first step. */
  readonly onExit: () => void;
  /** Server-side error from the final submit, if any. */
  readonly submitError?: string | null;
};

/**
 * Guided task posting: one question per screen with a progress bar.
 *
 * A single long form asked a first-time Client for a category, title,
 * description, budget, schedule, landmark and exact address all at once. Splitting
 * it means each screen carries one decision, and `Continue` stays disabled with
 * an inline reason until that decision is valid — so a mistake surfaces where it
 * can still be fixed rather than at submit.
 *
 * Validation per step mirrors `createTaskSchema`, so passing every step
 * guarantees the final submit will not be rejected for a field the user already
 * confirmed.
 */
export function TaskWizard({
  value,
  onChange,
  categoryPreselected,
  onSubmit,
  submitting,
  onExit,
  submitError,
}: TaskWizardProps) {
  const steps = useMemo(() => stepsFor(categoryPreselected), [categoryPreselected]);
  const [index, setIndex] = useState(0);
  /** Only show a step's error once the user has tried to move on. */
  const [touched, setTouched] = useState(false);

  const step = steps[index] ?? steps[0]!;
  const { position, total, fraction } = stepProgress(steps, step);
  const error = validateStep(step, value);
  const ready = canContinue(step, value);
  const isReview = step === "review";

  function set<K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) {
    onChange({ ...value, [key]: next });
    setTouched(false);
  }

  const goBack = useCallback(() => {
    setTouched(false);
    if (index === 0) {
      onExit();
      return;
    }
    setIndex((current) => current - 1);
  }, [index, onExit]);

  const goNext = useCallback(() => {
    if (!ready) {
      setTouched(true);
      return;
    }
    setTouched(false);
    if (!isReview) {
      setIndex((current) => Math.min(current + 1, steps.length - 1));
      return;
    }
    // Belt and braces: if an earlier step was edited back into an invalid state,
    // return there instead of submitting something the server would reject.
    const incomplete = firstIncompleteStep(steps, value);
    if (incomplete) {
      setIndex(steps.indexOf(incomplete));
      setTouched(true);
      return;
    }
    onSubmit();
  }, [ready, isReview, steps, value, onSubmit]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={index === 0 ? "Leave task posting" : "Back to the previous step"}
          hitSlop={10}
          style={styles.backButton}
        >
          <Icon name="arrow-right" size={22} color={theme.textPrimary} />
        </Pressable>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: total, now: position }}
          accessibilityLabel={`Step ${position} of ${total}`}
        >
          <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.stepCount}>
          Step {position} of {total}
        </Text>
        <StepBody step={step} value={value} set={set} />

        {touched && error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {submitError ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {submitError}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={isReview ? "Post task" : "Continue"}
          onPress={goNext}
          loading={submitting}
          disabled={!ready}
          {...(!ready && error ? { accessibilityHint: error } : {})}
          fullWidth
        />
      </View>
    </View>
  );
}

type StepBodyProps = {
  readonly step: WizardStepId;
  readonly value: TaskDraftFormValue;
  readonly set: <K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) => void;
};

function StepBody({ step, value, set }: StepBodyProps) {
  const { nameFor } = useCategories();

  switch (step) {
    case "category":
      return (
        <>
          <Prompt title="What kind of help?" hint="Pick the category that fits best." />
          <CategoryPicker
            value={value.categoryId}
            onChange={(categoryId) => set("categoryId", categoryId)}
          />
        </>
      );

    case "title":
      return (
        <>
          <Prompt title="Start with a title" hint="In a few words, what do you need done?" />
          <TextField
            label="Task title"
            value={value.title}
            onChangeText={(text) => set("title", text)}
            placeholder="e.g. Move my couch"
            maxLength={120}
            autoFocus
          />
          <Text style={styles.counter}>{120 - value.title.length} characters left</Text>
        </>
      );

    case "description":
      return (
        <>
          <Prompt
            title="Add the details"
            hint="What should the Tasker know before they make an offer?"
          />
          <TextField
            label="Description"
            value={value.description}
            onChangeText={(text) => set("description", text)}
            placeholder="Size, access, whether tools are provided, anything specific…"
            multiline
            numberOfLines={6}
            maxLength={4000}
          />
        </>
      );

    case "budget":
      return (
        <>
          <Prompt
            title="What's your budget?"
            hint="Taskers can offer a different amount — this is your starting point."
          />
          <TextField
            label="Budget in pesos"
            value={value.budget}
            onChangeText={(text) => set("budget", text)}
            keyboardType="numeric"
            placeholder="0.00"
          />
          <Text style={styles.counter}>Minimum ₱20.00</Text>
        </>
      );

    case "schedule":
      return (
        <>
          <Prompt title="When do you need it?" hint="Choose same day, or give a date and time." />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>I need this done today</Text>
            <Switch
              value={value.sameDay}
              onValueChange={(next) => set("sameDay", next)}
              accessibilityLabel="I need this done today"
              accessibilityRole="switch"
            />
          </View>
          {!value.sameDay ? (
            <TextField
              label="Preferred date and time"
              value={value.scheduledFor}
              onChangeText={(text) => set("scheduledFor", text)}
              placeholder="2026-08-14 09:00"
              description="Leave blank if you are flexible."
            />
          ) : null}
        </>
      );

    case "location":
      return (
        <>
          <Prompt title="Where is it?" hint="Taskers see the area. Only your Tasker sees the address." />
          <TextField
            label="Public landmark"
            value={value.landmark}
            onChangeText={(text) => set("landmark", text)}
            placeholder="e.g. Near SM North EDSA"
            description="Shown to every Tasker browsing open tasks."
            maxLength={200}
          />
          <View style={styles.privateNotice}>
            <Icon name="shield" size={16} color={theme.textSecondary} />
            <Text style={styles.privateNoticeText}>
              The exact address stays private and is released only to the Tasker you book, after
              payment is confirmed.
            </Text>
          </View>
          <TextField
            label="Exact address"
            value={value.exactAddress}
            onChangeText={(text) => set("exactAddress", text)}
            placeholder="Unit, street, barangay"
            maxLength={500}
          />
        </>
      );

    case "review": {
      const centavos = budgetToCentavos(value.budget) ?? 0;
      const categoryName = value.categoryId ? nameFor(value.categoryId) : null;
      return (
        <>
          <Prompt title="Ready to post?" hint="Check the details — you can still edit after posting." />
          <View style={styles.reviewCard}>
            <ReviewRow label="Category" text={categoryName ?? "Not set"} />
            <ReviewRow label="Title" text={value.title.trim() || "Not set"} />
            <ReviewRow label="Description" text={value.description.trim() || "Not set"} />
            <ReviewRow label="Budget" text={formatPhp(centavos)} />
            <ReviewRow
              label="When"
              text={value.sameDay ? "Today" : value.scheduledFor.trim() || "Flexible"}
            />
            <ReviewRow label="Area" text={value.landmark.trim() || "Not set"} />
            <ReviewRow label="Exact address" text="Private until you book" />
          </View>
        </>
      );
    }
  }
}

function Prompt({ title, hint }: { readonly title: string; readonly hint: string }) {
  return (
    <View style={styles.prompt}>
      <Text style={styles.promptTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.promptHint}>{hint}</Text>
    </View>
  );
}

function ReviewRow({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    // The icon set has a single directional arrow; mirror it to point back.
    transform: [{ scaleX: -1 }],
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: theme.borderSubtle,
    overflow: "hidden",
    marginRight: spacing.lg,
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: theme.primary,
  },
  body: { flex: 1 },
  bodyContent: { paddingBottom: spacing.xl },
  stepCount: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  prompt: { marginBottom: spacing.xl },
  promptTitle: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.5,
  },
  promptHint: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  counter: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "right",
    marginTop: -spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
    marginBottom: spacing.md,
  },
  switchLabel: { fontSize: fontSize.md, fontWeight: "600", color: theme.textPrimary },
  privateNotice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  privateNoticeText: { flex: 1, fontSize: fontSize.xs, color: theme.textSecondary },
  reviewCard: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  reviewRow: { gap: 2 },
  reviewLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reviewValue: { fontSize: fontSize.md, color: theme.textPrimary },
  error: {
    marginTop: spacing.md,
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
  footer: { paddingVertical: spacing.md },
});
