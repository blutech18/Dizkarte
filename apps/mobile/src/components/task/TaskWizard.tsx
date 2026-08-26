import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatPhp } from "@dizkarte/domain";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { CenterDialogModal } from "../ui/CenterDialogModal";
import {
  budgetToCentavos,
  canContinue,
  firstIncompleteStep,
  stepProgress,
  stepsFor,
  validateStep,
  type WizardStepId,
} from "./taskWizardSteps";
import { timeOfDayLabel, type TaskDraftFormValue } from "./taskDraftValue";
import { BOOLEAN_ANSWERS } from "./taskCategoryQuestions";
import type { TaskQuestionDefinition } from "../../services/marketplace/types";
import { TaskPhotoPicker, type PendingTaskPhoto } from "./TaskPhotoPicker";
import { LocationSearchModal, locationSelectionToDraftPatch } from "./LocationSearchModal";
import { LocalityPicker } from "./LocalityPicker";
import { TaskSchedulePicker } from "./TaskSchedulePicker";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  noWebOutline,
} from "../../theme";

type TimeOfDay = "morning" | "midday" | "afternoon" | "evening";

/**
 * Public label used for a remote task's location.
 *
 * A task always carries a public location, but an online task has no work site,
 * so the label says so rather than naming a place nobody travels to. The
 * authoritative signal is the persisted `locationType` — this string is only
 * what a reader sees.
 */
const ONLINE_PLACEHOLDER = "Online / Remote";
const TIME_SLOTS: ReadonlyArray<{
  readonly key: TimeOfDay;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconName;
}> = [
  { key: "morning", label: "Morning", sub: "Before 10am", icon: "calendar" },
  { key: "midday", label: "Midday", sub: "10am - 2pm", icon: "calendar" },
  { key: "afternoon", label: "Afternoon", sub: "2pm - 6pm", icon: "calendar" },
  { key: "evening", label: "Evening", sub: "After 6pm", icon: "calendar" },
];

/** Common starting budgets, in whole pesos, offered as one-tap quick-select chips. */
const BUDGET_SUGGESTIONS: ReadonlyArray<number> = [200, 500, 1000, 2000, 5000];

export type TaskWizardProps = {
  readonly value: TaskDraftFormValue;
  readonly onChange: (next: TaskDraftFormValue) => void;
  readonly photos: ReadonlyArray<PendingTaskPhoto>;
  readonly onPhotosChange: (next: ReadonlyArray<PendingTaskPhoto>) => void;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
  /** Called when the user backs out of the first step. */
  readonly onExit: () => void;
  /** Server-side error from the final submit, if any. */
  readonly submitError?: string | null;
  /**
   * Category-guided questions for the currently selected category, loaded from
   * the database by the screen. Empty is a valid state (a category may define
   * none), in which case the details step is just the description.
   */
  readonly questions: ReadonlyArray<TaskQuestionDefinition>;
};

/**
 * Whether the draft has anything worth protecting before leaving.
 *
 * A title seeded from the search box or a category tile counts — the Client
 * arrived with intent — so backing out still confirms, while an untouched,
 * empty form leaves immediately without a needless prompt. The "Online /
 * Remote" sentinel is not treated as a real location entry on its own.
 */
function hasEnteredTaskContent(
  value: TaskDraftFormValue,
  photos: ReadonlyArray<PendingTaskPhoto>,
): boolean {
  if (photos.length > 0) return true;
  if (value.title.trim().length > 0) return true;
  if (value.description.trim().length > 0) return true;
  if (value.budget.trim().length > 0) return true;
  if (value.scheduledFor.trim().length > 0 || value.sameDay) return true;
  if (Object.keys(value.categoryAnswers).length > 0) return true;
  if (value.cityCode !== null || value.barangayCode !== null) return true;
  const landmark = value.landmark.trim();
  if (landmark.length > 0 && landmark !== ONLINE_PLACEHOLDER) return true;
  return false;
}

/**
 * Guided task posting: one question per screen with a progress bar.
 */
export function TaskWizard({
  value,
  onChange,
  photos,
  onPhotosChange,
  onSubmit,
  submitting,
  onExit,
  submitError,
  questions,
}: TaskWizardProps) {
  const steps = useMemo(() => stepsFor(), []);
  const [index, setIndex] = useState(0);
  /** Only show a step's error once the user has tried to move on. */
  const [touched, setTouched] = useState(false);
  /** Confirmation before abandoning a partially completed draft. */
  const [showDiscard, setShowDiscard] = useState(false);

  // Only the catalogue's required questions gate Continue; the rest are optional.
  const requiredQuestions = useMemo(
    () => questions.filter((q) => q.required).map((q) => ({ id: q.id, label: q.label })),
    [questions],
  );

  const step = steps[index] ?? steps[0]!;
  const { position, total, fraction } = stepProgress(steps, step);
  const error = validateStep(step, value, requiredQuestions);
  const ready = canContinue(step, value, requiredQuestions);
  const isReview = step === "review";
  const isPhotos = step === "photos";

  function set<K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) {
    onChange({ ...value, [key]: next });
    setTouched(false);
  }

  function setMultiple(patch: Partial<TaskDraftFormValue>) {
    onChange({ ...value, ...patch });
    setTouched(false);
  }

  const animValue = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 0,
      duration: 300,
      easing: Easing.bezier(0.0, 0.0, 0.2, 1),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [animValue]);

  const animateStepTransition = useCallback(
    (nextIndex: number, isForward: boolean) => {
      // Phase 1 — accelerate the current step off-screen and fade it to fully
      // transparent before anything is swapped.
      Animated.timing(animValue, {
        toValue: isForward ? -1 : 1,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start(() => {
        // Swap the step and jump to the opposite edge while still fully
        // transparent, so the content change is never on screen.
        setIndex(nextIndex);
        animValue.setValue(isForward ? 1 : -1);
        // Defer the entrance by one frame so the freshly-committed step is
        // painted at opacity 0 *before* it eases in. Without this deferral the
        // new content can flash for a frame at the wrong position — the flicker.
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
          Animated.timing(animValue, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }).start();
        });
      });
    },
    [animValue],
  );

  /** Slide the first step off-screen, then hand control back to the caller to leave. */
  const runExitAnimation = useCallback(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 160,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      onExit();
    });
  }, [animValue, onExit]);

  const goBack = useCallback(() => {
    setTouched(false);
    if (index === 0) {
      // Backing out of the first step abandons the whole draft. If anything has
      // been entered, confirm first so a stray back-tap never silently loses a
      // partially completed task (the Airtasker "Discard task?" safeguard).
      if (hasEnteredTaskContent(value, photos)) {
        setShowDiscard(true);
        return;
      }
      runExitAnimation();
      return;
    }
    animateStepTransition(index - 1, false);
  }, [index, value, photos, runExitAnimation, animateStepTransition]);

  /** Jump directly to a step (used by the "Edit" affordance on the review card). */
  const goToStep = useCallback(
    (target: WizardStepId) => {
      const targetIndex = steps.indexOf(target);
      if (targetIndex < 0 || targetIndex === index) return;
      setTouched(false);
      animateStepTransition(targetIndex, targetIndex > index);
    },
    [steps, index, animateStepTransition],
  );

  const goNext = useCallback(() => {
    if (!ready) {
      setTouched(true);
      return;
    }
    setTouched(false);
    if (!isReview) {
      animateStepTransition(Math.min(index + 1, steps.length - 1), true);
      return;
    }
    const incomplete = firstIncompleteStep(steps, value, requiredQuestions);
    if (incomplete) {
      const targetIndex = steps.indexOf(incomplete);
      animateStepTransition(targetIndex, targetIndex > index);
      setTouched(true);
      return;
    }
    onSubmit();
  }, [ready, isReview, steps, value, onSubmit, index, animateStepTransition]);

  const buttonLabel = isReview
    ? "Post task"
    : isPhotos && photos.length === 0
      ? "Skip for now"
      : "Continue";

  const buttonVariant = isPhotos && photos.length === 0 ? "secondary" : "primary";

  const translateX = animValue.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-32, 0, 32],
  });

  const opacity = animValue.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0, 1, 0],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={index === 0 ? "Leave task posting" : "Back to the previous step"}
          hitSlop={10}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? { opacity: 0.7, transform: [{ scale: 0.92 }] } : null,
          ]}
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

      <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepCount}>
            Step {position} of {total}
          </Text>
          <StepBody
            step={step}
            value={value}
            photos={photos}
            onPhotosChange={onPhotosChange}
            set={set}
            setMultiple={setMultiple}
            onEditStep={goToStep}
            questions={questions}
          />

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
      </Animated.View>

      <View style={styles.footer}>
        <Button
          label={buttonLabel}
          variant={buttonVariant}
          onPress={goNext}
          loading={submitting}
          disabled={!ready}
          {...(!ready && error ? { accessibilityHint: error } : {})}
          fullWidth
        />
      </View>

      <CenterDialogModal visible={showDiscard} onClose={() => setShowDiscard(false)}>
        <View style={styles.discardCard}>
          <View style={styles.discardIconBox}>
            <Icon name="alert-circle" size={24} color={theme.errorSolid} />
          </View>
          <Text style={styles.discardTitle} accessibilityRole="header">
            Discard task?
          </Text>
          <Text style={styles.discardMessage}>
            Are you sure you want to stop posting this task? Your progress won&apos;t be saved.
          </Text>
          <View style={styles.discardActions}>
            <Button
              label="Discard task"
              variant="destructive"
              onPress={() => {
                setShowDiscard(false);
                runExitAnimation();
              }}
              fullWidth
            />
            <Button
              label="Nevermind"
              variant="secondary"
              onPress={() => setShowDiscard(false)}
              fullWidth
            />
          </View>
        </View>
      </CenterDialogModal>
    </View>
  );
}

type StepBodyProps = {
  readonly step: WizardStepId;
  readonly value: TaskDraftFormValue;
  readonly photos: ReadonlyArray<PendingTaskPhoto>;
  readonly onPhotosChange: (next: ReadonlyArray<PendingTaskPhoto>) => void;
  readonly set: <K extends keyof TaskDraftFormValue>(key: K, next: TaskDraftFormValue[K]) => void;
  readonly setMultiple: (patch: Partial<TaskDraftFormValue>) => void;
  /** Jumps straight to another step; used by the review card's "Edit" links. */
  readonly onEditStep: (step: WizardStepId) => void;
  /** Category-guided questions for the selected category, in display order. */
  readonly questions: ReadonlyArray<TaskQuestionDefinition>;
};

function StepBody({
  step,
  value,
  photos,
  onPhotosChange,
  set,
  setMultiple,
  onEditStep,
  questions,
}: StepBodyProps) {
  const [timeOfDayEnabled, setTimeOfDayEnabled] = useState(value.timeOfDay !== null);
  const selectedTimeSlot = value.timeOfDay;

  const [isRemovalsTask, setIsRemovalsTask] = useState(value.dropoffLandmark.trim().length > 0);
  const locationType = value.locationType;
  const [locSearchTarget, setLocSearchTarget] = useState<"suburb" | "pickup" | "dropoff" | null>(
    null,
  );
  const dropoffLocation = value.dropoffLandmark;
  const [budgetFocused, setBudgetFocused] = useState(false);
  // Starts near "0.00"'s natural width so there's no visible jump before the
  // ghost-text measurement below reports the real size on first layout.
  const [budgetInputWidth, setBudgetInputWidth] = useState(64);

  switch (step) {
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

    case "schedule": {
      return (
        <>
          <Prompt title="Choose a time" hint="When do you need this done?" />

          <TaskSchedulePicker
            sameDay={value.sameDay}
            scheduledFor={value.scheduledFor}
            onChange={setMultiple}
          />

          {/* Checkbox for Certain Time of Day */}
          <Pressable
            onPress={() => {
              const next = !timeOfDayEnabled;
              setTimeOfDayEnabled(next);
              // Turning the option off clears any stored slot so the posted task
              // reflects "flexible within the day" rather than a stale choice.
              if (!next) set("timeOfDay", null);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: timeOfDayEnabled }}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkboxBox, timeOfDayEnabled ? styles.checkboxBoxChecked : null]}>
              {timeOfDayEnabled ? (
                <Icon name="check-circle" size={14} color={theme.onPrimary} />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>I need a certain time of day</Text>
          </Pressable>

          {/* 2x2 Grid of Time Slots */}
          {timeOfDayEnabled ? (
            <View style={styles.timeOfDayGrid}>
              {TIME_SLOTS.map((slot) => {
                const isSelected = selectedTimeSlot === slot.key;
                return (
                  <Pressable
                    key={slot.key}
                    onPress={() => set("timeOfDay", slot.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label}, ${slot.sub}`}
                    style={({ pressed }) => [
                      styles.timeSlotCard,
                      isSelected ? styles.timeSlotCardSelected : null,
                      pressed ? { opacity: 0.88, transform: [{ scale: 0.97 }] } : null,
                    ]}
                  >
                    <Icon
                      name={slot.icon}
                      size={24}
                      color={isSelected ? theme.primary : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.timeSlotTitle,
                        isSelected ? styles.timeSlotTitleSelected : null,
                      ]}
                    >
                      {slot.label}
                    </Text>
                    <Text style={styles.timeSlotSub}>{slot.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      );
    }

    case "location":
      return (
        <>
          <Prompt title="Say where" hint="Where do you need it done?" />

          {/* Is this a removals task? */}
          <Text style={styles.locationQuestionTitle}>Is this a removals task?</Text>
          <View style={styles.yesNoRow}>
            <Pressable
              onPress={() => setIsRemovalsTask(true)}
              accessibilityRole="button"
              accessibilityLabel="Yes, this is a removals task"
              style={({ pressed }) => [
                styles.yesNoBtn,
                isRemovalsTask ? styles.yesNoBtnActive : null,
                pressed ? { opacity: 0.88 } : null,
              ]}
            >
              <Text style={[styles.yesNoText, isRemovalsTask ? styles.yesNoTextActive : null]}>
                Yes
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsRemovalsTask(false);
                // Not a removals task any more, so a stored drop-off would be
                // stale data on the posted task.
                if (value.dropoffLandmark) setMultiple({ dropoffLandmark: "" });
              }}
              accessibilityRole="button"
              accessibilityLabel="No, this is not a removals task"
              style={({ pressed }) => [
                styles.yesNoBtn,
                !isRemovalsTask ? styles.yesNoBtnActive : null,
                pressed ? { opacity: 0.88 } : null,
              ]}
            >
              <Text style={[styles.yesNoText, !isRemovalsTask ? styles.yesNoTextActive : null]}>
                No
              </Text>
            </Pressable>
          </View>

          {isRemovalsTask ? (
            /* Removals Task: Pickup and Drop-off */
            <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
              <View>
                <Text style={styles.locationInputLabel}>Pickup location</Text>
                <Pressable
                  onPress={() => setLocSearchTarget("pickup")}
                  style={[
                    styles.suburbSelectBox,
                    value.landmark ? styles.suburbSelectBoxSelected : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Pickup location"
                  accessibilityHint="Opens location search"
                >
                  <View style={styles.locationSelectIcon}>
                    <Icon name="map-pin" size={20} color={theme.primary} />
                  </View>
                  <Text
                    style={[
                      styles.suburbSelectText,
                      value.landmark ? styles.suburbSelectTextSelected : null,
                    ]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {value.landmark || "Enter suburb"}
                  </Text>
                  <View style={styles.locationSelectChevron}>
                    <Icon name="chevron-right" size={18} color={theme.textSecondary} />
                  </View>
                </Pressable>
              </View>

              <View>
                <Text style={styles.locationInputLabel}>Drop-off location (optional)</Text>
                <Pressable
                  onPress={() => setLocSearchTarget("dropoff")}
                  style={[
                    styles.suburbSelectBox,
                    dropoffLocation ? styles.suburbSelectBoxSelected : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Drop-off location"
                  accessibilityHint="Opens location search"
                >
                  <View style={styles.locationSelectIcon}>
                    <Icon name="map-pin" size={20} color={theme.primary} />
                  </View>
                  <Text
                    style={[
                      styles.suburbSelectText,
                      dropoffLocation ? styles.suburbSelectTextSelected : null,
                    ]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {dropoffLocation || "Enter suburb"}
                  </Text>
                  <View style={styles.locationSelectChevron}>
                    <Icon name="chevron-right" size={18} color={theme.textSecondary} />
                  </View>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Standard Task: In Person vs Online cards */
            <>
              <View style={styles.locTypeGrid}>
                {/* In Person Card */}
                <Pressable
                  onPress={() =>
                    setMultiple({
                      locationType: "in_person",
                      // Clear the placeholder the online branch wrote so the
                      // Client picks a real suburb instead of inheriting it.
                      ...(value.landmark === ONLINE_PLACEHOLDER
                        ? { landmark: "", exactAddress: "" }
                        : {}),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="In Person"
                  style={({ pressed }) => [
                    styles.locTypeCard,
                    locationType === "in_person" ? styles.locTypeCardActive : null,
                    pressed ? { opacity: 0.88 } : null,
                  ]}
                >
                  <Icon
                    name="home"
                    size={28}
                    color={locationType === "in_person" ? "#FFFFFF" : theme.textPrimary}
                  />
                  <Text
                    style={[
                      styles.locTypeTitle,
                      locationType === "in_person" ? styles.locTypeTitleActive : null,
                    ]}
                  >
                    In Person
                  </Text>
                  <Text
                    style={[
                      styles.locTypeSub,
                      locationType === "in_person" ? styles.locTypeSubActive : null,
                    ]}
                  >
                    They need to show up at a place
                  </Text>
                </Pressable>

                {/* Online Card */}
                <Pressable
                  onPress={() =>
                    setMultiple({
                      locationType: "online",
                      // A remote task has no work site, but the public location
                      // is a required part of every task, so the label states
                      // that plainly instead of naming a place nobody visits.
                      landmark: ONLINE_PLACEHOLDER,
                      exactAddress: ONLINE_PLACEHOLDER,
                      // A remote task cannot have a physical drop-off.
                      dropoffLandmark: "",
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Online"
                  style={({ pressed }) => [
                    styles.locTypeCard,
                    locationType === "online" ? styles.locTypeCardActive : null,
                    pressed ? { opacity: 0.88 } : null,
                  ]}
                >
                  <Icon
                    name="video"
                    size={28}
                    color={locationType === "online" ? "#FFFFFF" : theme.textPrimary}
                  />
                  <Text
                    style={[
                      styles.locTypeTitle,
                      locationType === "online" ? styles.locTypeTitleActive : null,
                    ]}
                  >
                    Online
                  </Text>
                  <Text
                    style={[
                      styles.locTypeSub,
                      locationType === "online" ? styles.locTypeSubActive : null,
                    ]}
                  >
                    They can do it from their home
                  </Text>
                </Pressable>
              </View>

              {locationType === "in_person" ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.locationInputLabel}>Suburb</Text>
                  <Pressable
                    onPress={() => setLocSearchTarget("suburb")}
                    style={[
                      styles.suburbSelectBox,
                      value.landmark && value.landmark !== ONLINE_PLACEHOLDER
                        ? styles.suburbSelectBoxSelected
                        : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Suburb"
                    accessibilityHint="Opens location search"
                  >
                    <View style={styles.locationSelectIcon}>
                      <Icon name="map-pin" size={20} color={theme.primary} />
                    </View>
                    <Text
                      style={[
                        styles.suburbSelectText,
                        value.landmark && value.landmark !== ONLINE_PLACEHOLDER
                          ? styles.suburbSelectTextSelected
                          : null,
                      ]}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {value.landmark && value.landmark !== ONLINE_PLACEHOLDER
                        ? value.landmark
                        : "Enter suburb"}
                    </Text>
                    <View style={styles.locationSelectChevron}>
                      <Icon name="chevron-right" size={18} color={theme.textSecondary} />
                    </View>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}

          {/* City & barangay — canonical PSGC, required for discovery filtering. */}
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <Text style={styles.locationInputLabel}>City & barangay</Text>
            <LocalityPicker
              value={{ cityCode: value.cityCode, barangayCode: value.barangayCode }}
              onChange={(next) =>
                setMultiple({ cityCode: next.cityCode, barangayCode: next.barangayCode })
              }
              cityRequired
              barangayRequired
            />
          </View>

          {/* Location Search Modal Dialog */}
          <LocationSearchModal
            visible={locSearchTarget !== null}
            onSelect={(selection) => {
              if (locSearchTarget === "dropoff") {
                // Only the public area label is kept. `exactAddress` would be a
                // second precise address on a publicly readable task, which the
                // privacy model does not allow (requirement R4).
                setMultiple({ dropoffLandmark: selection.description });
              } else {
                setMultiple(locationSelectionToDraftPatch(selection));
              }
              setLocSearchTarget(null);
            }}
            onClose={() => setLocSearchTarget(null)}
          />
        </>
      );

    case "description": {
      const descriptionLength = value.description.trim().length;
      const setAnswer = (id: string, answer: string) => {
        const next = { ...value.categoryAnswers };
        if (answer) next[id] = answer;
        else delete next[id];
        set("categoryAnswers", next);
      };
      return (
        <>
          <Prompt
            title="Describe what you need done"
            hint={
              questions.length > 0
                ? "A few specifics help Taskers quote accurately."
                : "Summarise the key details of the job."
            }
          />
          {questions.length > 0 ? (
            <View style={styles.detailsList}>
              {questions.map((question) => (
                <CategoryQuestionField
                  key={question.id}
                  question={question}
                  value={value.categoryAnswers[question.id] ?? ""}
                  onChange={(answer) => setAnswer(question.id, answer)}
                />
              ))}
            </View>
          ) : null}
          <TextField
            label="Description"
            value={value.description}
            onChangeText={(text) => set("description", text)}
            description="Include the scope, access, tools or materials, and anything Taskers should know."
            placeholder="Example: Move a two-seater sofa from the second floor. Stairs only; no lift."
            multiline
            numberOfLines={6}
            maxLength={4000}
          />
          <Text
            style={[
              styles.descriptionCounter,
              descriptionLength < 20 ? styles.descriptionCounterPending : null,
            ]}
            accessibilityLiveRegion="polite"
          >
            {descriptionLength < 20
              ? `${20 - descriptionLength} more character${20 - descriptionLength === 1 ? "" : "s"} needed`
              : `${descriptionLength.toLocaleString()} / 4,000 characters`}
          </Text>
          {questions.length > 0 ? (
            <Text style={styles.detailsHint}>
              Your answers are shown to Taskers alongside this description.
            </Text>
          ) : null}
        </>
      );
    }

    case "photos":
      return (
        <>
          <Prompt
            title="Snap a photo"
            hint="Help Taskers quote accurately with clear photos of the work area."
          />
          <TaskPhotoPicker value={photos} onChange={onPhotosChange} />
        </>
      );

    case "budget": {
      const centavos = budgetToCentavos(value.budget);
      const isValid = centavos !== null && centavos >= 2000;
      return (
        <>
          <Prompt
            title="Enter your budget"
            hint="Don't worry, you can always negotiate the final price later"
          />

          <View
            style={[styles.budgetHeroCard, budgetFocused ? styles.budgetHeroCardFocused : null]}
          >
            <Text style={styles.budgetHeroLabel}>YOUR BUDGET</Text>
            <View style={styles.budgetInputRow}>
              <Text style={styles.budgetPrefix}>₱</Text>
              <TextInput
                value={value.budget}
                onChangeText={(text) => set("budget", text)}
                onFocus={() => setBudgetFocused(true)}
                onBlur={() => setBudgetFocused(false)}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                style={[styles.budgetInput, { width: budgetInputWidth }, noWebOutline]}
                accessibilityLabel="Budget in pesos"
              />
              {/*
                Invisible ghost text, same font as the real input, mirrors its
                displayed content. Its measured layout width drives the real
                input's `width` so the box (and the whole centered "₱ amount"
                group) grows and shrinks smoothly from 4 digits to 5 or 6 —
                a fixed-width box left the cursor rendering in the dead centre
                of an empty field, which visually looked like it was stuck
                mid-placeholder instead of at the start of the value.
              */}
              <Text
                style={styles.budgetGhostText}
                numberOfLines={1}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onLayout={(e) => {
                  const measured = Math.ceil(e.nativeEvent.layout.width);
                  setBudgetInputWidth(Math.min(Math.max(measured + 14, 64), 240));
                }}
              >
                {value.budget || "0.00"}
              </Text>
            </View>
            <Text style={[styles.budgetHelperText, isValid ? styles.budgetHelperValid : null]}>
              {isValid ? `You'll offer ${formatPhp(centavos)}` : "Minimum ₱20.00"}
            </Text>
          </View>

          <Text style={styles.budgetChipsLabel}>Quick amounts</Text>
          <View style={styles.budgetChipsRow}>
            {BUDGET_SUGGESTIONS.map((amount) => {
              const active = centavos === amount * 100;
              return (
                <Pressable
                  key={amount}
                  onPress={() => set("budget", String(amount))}
                  accessibilityRole="button"
                  accessibilityLabel={`Set budget to ₱${amount.toLocaleString("en-PH")}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.budgetChip,
                    active ? styles.budgetChipActive : null,
                    pressed ? { opacity: 0.88 } : null,
                  ]}
                >
                  <Text
                    style={[styles.budgetChipText, active ? styles.budgetChipTextActive : null]}
                  >
                    ₱{amount.toLocaleString("en-PH")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <WizardNotice
            icon="note"
            title="A flexible starting point"
            description="You can adjust this budget before accepting an offer."
          />
        </>
      );
    }

    case "review": {
      const centavos = budgetToCentavos(value.budget) ?? 0;
      const visiblePhotos = photos.slice(0, 4);
      const overflowCount = photos.length - visiblePhotos.length;
      return (
        <>
          <Prompt title="Alright, ready to get offers?" hint="Review the details before you post" />

          <View style={styles.reviewCard}>
            <ReviewRow
              icon="briefcase"
              label="Title"
              text={value.title.trim() || "Not set"}
              onEdit={() => onEditStep("title")}
            />
            <View style={styles.reviewDivider} />
            <ReviewRow
              icon="calendar"
              label="When"
              text={formatScheduleForReview(value.sameDay, value.scheduledFor, value.timeOfDay)}
              onEdit={() => onEditStep("schedule")}
            />
            <View style={styles.reviewDivider} />
            <ReviewRow
              icon="map-pin"
              label="Where"
              text={
                value.dropoffLandmark.trim()
                  ? `${value.landmark.trim() || "Not set"} → ${value.dropoffLandmark.trim()}`
                  : value.landmark.trim() || "Not set"
              }
              onEdit={() => onEditStep("location")}
            />
            <View style={styles.reviewDivider} />
            <ReviewRow
              icon="note"
              label="Description"
              text={value.description.trim() || "Not set"}
              onEdit={() => onEditStep("description")}
            />
            {/*
              Each answered category question gets its own labelled row, the way
              the reference flow shows them ("Stairs: At both places") — they are
              structured task data, not part of the description prose.
            */}
            {questions
              .filter((question) => (value.categoryAnswers[question.id] ?? "").trim().length > 0)
              .map((question) => (
                <View key={question.id}>
                  <View style={styles.reviewDivider} />
                  <ReviewRow
                    icon="note"
                    label={question.label}
                    text={(value.categoryAnswers[question.id] ?? "").trim()}
                    onEdit={() => onEditStep("description")}
                  />
                </View>
              ))}
            <View style={styles.reviewDivider} />
            <ReviewRow icon="image" label="Photos" onEdit={() => onEditStep("photos")}>
              {photos.length === 0 ? (
                <Text style={styles.reviewValue}>None added</Text>
              ) : (
                <View style={styles.reviewPhotosRow}>
                  {visiblePhotos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.uri }}
                      style={styles.reviewPhotoThumb}
                      accessibilityLabel="Task photo"
                    />
                  ))}
                  {overflowCount > 0 ? (
                    <View style={styles.reviewPhotoOverflow}>
                      <Text style={styles.reviewPhotoOverflowText}>+{overflowCount}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </ReviewRow>
          </View>

          <Pressable
            onPress={() => onEditStep("budget")}
            accessibilityRole="button"
            accessibilityLabel="Edit budget"
            style={({ pressed }) => [
              styles.reviewBudgetCard,
              pressed ? styles.reviewRowPressed : null,
            ]}
          >
            <View style={styles.reviewBudgetHeader}>
              <Icon name="wallet" size={20} color={theme.primary} />
              <Text style={styles.reviewBudgetLabel}>Starting budget</Text>
              <View style={styles.reviewEditChip}>
                <Text style={styles.reviewEditText}>Edit</Text>
                <Icon name="edit" size={17} color={theme.primary} />
              </View>
            </View>
            <Text style={styles.reviewBudgetValue}>{formatPhp(centavos)}</Text>
          </Pressable>

          <WizardNotice
            icon="check-circle"
            title="Ready when you are"
            description="You can update these details again after posting."
          />
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

function WizardNotice({
  icon,
  title,
  description,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <View style={styles.noticeCard}>
      <View style={styles.noticeHeader}>
        <Icon name={icon} size={18} color={theme.infoOnSoft} />
        <Text style={styles.noticeTitle}>{title}</Text>
      </View>
      <Text style={styles.noticeCardText}>{description}</Text>
    </View>
  );
}

/** One category-guided question: select/boolean render as chips, number/text as an input. */
function CategoryQuestionField({
  question,
  value,
  onChange,
}: {
  readonly question: TaskQuestionDefinition;
  readonly value: string;
  readonly onChange: (answer: string) => void;
}) {
  const chipOptions =
    question.inputKind === "boolean"
      ? BOOLEAN_ANSWERS
      : question.inputKind === "select"
        ? question.options
        : null;

  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>
        {question.label}
        {question.required ? "" : " (optional)"}
      </Text>
      {chipOptions ? (
        <View style={styles.detailChipsRow}>
          {chipOptions.map((option) => {
            const active = value === option;
            return (
              <Pressable
                key={option}
                onPress={() => onChange(active ? "" : option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${question.label}: ${option}`}
                style={({ pressed }) => [
                  styles.detailChip,
                  active ? styles.detailChipActive : null,
                  pressed ? { opacity: 0.88 } : null,
                ]}
              >
                <Text style={[styles.detailChipText, active ? styles.detailChipTextActive : null]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={(text) =>
            onChange(question.inputKind === "number" ? text.replace(/[^\d]/g, "") : text)
          }
          keyboardType={question.inputKind === "number" ? "numeric" : "default"}
          placeholder={question.placeholder ?? undefined}
          placeholderTextColor={theme.textSecondary}
          style={[styles.detailTextInput, noWebOutline]}
          accessibilityLabel={question.label}
          // Matches the 500-character limit on a stored answer.
          maxLength={question.inputKind === "number" ? 6 : 500}
        />
      )}
    </View>
  );
}

function ReviewRow({
  icon,
  label,
  text,
  onEdit,
  children,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly text?: string;
  readonly onEdit: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label.toLowerCase()}`}
      style={({ pressed }) => [styles.reviewRow, pressed ? styles.reviewRowPressed : null]}
    >
      <View style={styles.reviewRowHeader}>
        <View style={styles.locationSelectIcon}>
          <Icon name={icon} size={20} color={theme.primary} />
        </View>
        <Text style={styles.reviewLabel}>{label}</Text>
        <Icon name="edit" size={18} color={theme.primary} />
      </View>
      {children ?? <Text style={styles.reviewValue}>{text}</Text>}
    </Pressable>
  );
}

function formatScheduleForReview(
  sameDay: boolean,
  scheduledFor: string,
  timeOfDay: TimeOfDay | null,
): string {
  const period = timeOfDayLabel(timeOfDay);
  const suffix = period ? ` (${period})` : "";
  if (!scheduledFor.trim()) return `${sameDay ? "Today" : "Flexible"}${suffix}`;
  const date = new Date(scheduledFor);
  if (Number.isNaN(date.getTime())) return `${scheduledFor}${suffix}`;
  const formatted = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${sameDay ? "On" : "Before"} ${formatted}${suffix}`;
}

const styles = StyleSheet.create({
  discardCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  discardIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  discardTitle: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  discardMessage: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  discardActions: {
    width: "100%",
    gap: spacing.sm,
  },
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
    fontWeight: "600",
    color: theme.textSecondary,
    letterSpacing: 0.2,
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
    lineHeight: lineHeight.md,
    color: theme.textSecondary,
    marginTop: spacing.sm,
  },
  counter: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "right",
    marginTop: -spacing.sm,
  },
  descriptionCounter: {
    marginTop: -spacing.md,
    fontSize: fontSize.xs,
    color: theme.successSolid,
    textAlign: "right",
  },
  descriptionCounterPending: {
    color: theme.warningOnSoft,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
    marginBottom: spacing.md,
  },
  switchLabel: { fontSize: fontSize.md, fontWeight: "600", color: theme.textPrimary },
  noticeCard: {
    backgroundColor: theme.infoSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: theme.infoOnSoft,
  },
  noticeCardText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.infoOnSoft,
    fontWeight: "500",
  },
  budgetHeroCard: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  budgetHeroCardFocused: {
    borderColor: theme.primary,
  },
  budgetHeroLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  budgetInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  budgetPrefix: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.primary,
    marginRight: spacing.xs,
  },
  budgetInput: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.textPrimary,
    padding: 0,
    borderWidth: 0,
  },
  budgetGhostText: {
    position: "absolute",
    left: -9999,
    opacity: 0,
    fontSize: fontSize.xxl,
    fontWeight: "800",
  },
  budgetHelperText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  budgetHelperValid: {
    color: theme.successSolid,
    fontWeight: "600",
  },
  budgetChipsLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  budgetChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  budgetChip: {
    minHeight: MIN_TOUCH_TARGET - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  budgetChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  budgetChipTextActive: {
    color: theme.primary,
  },
  reviewCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
  },
  reviewRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  reviewRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  reviewRowPressed: {
    opacity: 0.7,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  reviewLabel: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reviewValue: {
    width: "100%",
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: theme.textPrimary,
  },
  reviewPhotosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  reviewPhotoThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
  },
  reviewPhotoOverflow: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPhotoOverflowText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  reviewBudgetCard: {
    backgroundColor: theme.primarySoft,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  reviewBudgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  reviewBudgetLabel: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reviewBudgetValue: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
    marginTop: 2,
  },
  reviewEditChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewEditText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.primary,
  },
  error: {
    marginTop: spacing.md,
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
  footer: { paddingVertical: spacing.md },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm - 2,
    borderWidth: 2,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  checkboxLabel: {
    fontSize: fontSize.sm + 1,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  timeOfDayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  timeSlotCard: {
    width: "48%",
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  timeSlotCardSelected: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  timeSlotTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  timeSlotTitleSelected: {
    color: theme.primary,
  },
  timeSlotSub: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  locationQuestionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.xs + 2,
  },
  yesNoRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  yesNoBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  yesNoBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  yesNoText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  yesNoTextActive: {
    color: theme.onPrimary,
    fontWeight: "700",
  },
  locTypeGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  locTypeCard: {
    flex: 1,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 120,
  },
  locTypeCardActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  locTypeTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  locTypeTitleActive: {
    color: theme.onPrimary,
  },
  locTypeSub: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "center",
  },
  locTypeSubActive: {
    color: "rgba(255, 255, 255, 0.88)",
  },
  locationInputLabel: {
    fontSize: fontSize.sm + 1,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  suburbSelectBox: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  suburbSelectBoxSelected: {
    backgroundColor: theme.surface,
    borderColor: theme.primary,
  },
  locationSelectIcon: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  locationSelectChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  suburbSelectText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  suburbSelectTextSelected: {
    color: theme.textPrimary,
    fontWeight: "600",
  },
  detailsList: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  detailField: {
    gap: spacing.sm,
  },
  detailLabel: {
    fontSize: fontSize.sm + 1,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  detailChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  detailChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  detailChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  detailChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  detailChipTextActive: {
    color: theme.primary,
  },
  detailTextInput: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderControl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },
  detailsHint: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    fontStyle: "italic",
  },
});
