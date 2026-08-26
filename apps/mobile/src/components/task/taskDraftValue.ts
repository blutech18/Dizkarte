import { createTaskSchema, type TaskLocationType, type TaskTimeOfDay } from "@dizkarte/domain";
import type {
  DraftTaskInput,
  TaskAnswerInput,
  TaskMediaAttachment,
} from "../../services/marketplace/types";

/**
 * The task draft form's value and its validation.
 *
 * Deliberately free of React Native imports so the rules can be unit-tested and
 * shared by both the guided wizard and the single-page edit form. The rendering
 * lives in `TaskDraftForm.tsx` / `TaskWizard.tsx`.
 */

export type TaskDraftFormValue = {
  readonly categoryId: string | null;
  readonly title: string;
  readonly description: string;
  readonly budget: string;
  readonly scheduledFor: string;
  readonly sameDay: boolean;
  readonly timeOfDay: TaskTimeOfDay | null;
  readonly locationType: TaskLocationType;
  readonly landmark: string;
  /** Public, area-level drop-off for a removals task. Empty means none. */
  readonly dropoffLandmark: string;
  readonly cityCode: string | null;
  readonly barangayCode: string | null;
  readonly exactAddress: string;
  readonly approximateLat: number;
  readonly approximateLng: number;
  readonly exactLat: number;
  readonly exactLng: number;
  readonly media: ReadonlyArray<TaskMediaAttachment>;
  /**
   * Answers to the category-guided questions, keyed by the question's database
   * id (`task_question_definitions.id`). Persisted as their own `task_answers`
   * rows, not folded into the description.
   */
  readonly categoryAnswers: Record<string, string>;
};

export const EMPTY_TASK_DRAFT_FORM: TaskDraftFormValue = {
  categoryId: null,
  title: "",
  description: "",
  budget: "",
  scheduledFor: "",
  sameDay: false,
  timeOfDay: null,
  locationType: "in_person",
  landmark: "",
  dropoffLandmark: "",
  cityCode: null,
  barangayCode: null,
  exactAddress: "",
  approximateLat: 14.657,
  approximateLng: 121.032,
  exactLat: 14.6575,
  exactLng: 121.0322,
  media: [],
  categoryAnswers: {},
};

export function draftFormFromInput(draft: DraftTaskInput): TaskDraftFormValue {
  return {
    categoryId: draft.categoryId,
    title: draft.title,
    description: draft.description,
    budget: (draft.budgetCentavos / 100).toFixed(2),
    scheduledFor: draft.scheduledFor ?? "",
    sameDay: draft.sameDay,
    timeOfDay: draft.timeOfDay ?? null,
    locationType: draft.locationType ?? "in_person",
    landmark: draft.landmark,
    dropoffLandmark: draft.dropoffLandmark ?? "",
    cityCode: draft.cityCode ?? null,
    barangayCode: draft.barangayCode ?? null,
    exactAddress: draft.exactAddress,
    approximateLat: draft.approximateLat,
    approximateLng: draft.approximateLng,
    exactLat: draft.exactLat,
    exactLng: draft.exactLng,
    media: draft.media,
    categoryAnswers: {},
  };
}

/**
 * Locality and coordinate defaults.
 *
 * Google geocoding supplies the real coordinates and address selected by the
 * Client; the PSGC city/barangay are chosen by the Client via the
 * `LocalityPicker` (canonical dataset, decision D14) and are required by
 * `publicLocationSchema`.
 */

/**
 * The answers to submit, as the repository expects them.
 *
 * Blank entries are dropped: an optional question left empty is an absence, not
 * an answer. An empty array is meaningful — it clears whatever was stored — so
 * the caller states explicitly whether it collected answers at all.
 */
function answersForSubmit(form: TaskDraftFormValue): ReadonlyArray<TaskAnswerInput> {
  return Object.entries(form.categoryAnswers)
    .map(([questionId, answer]) => ({ questionId, answer: answer.trim() }))
    .filter((entry) => entry.answer.length > 0);
}

export type ValidateTaskDraftOptions = {
  /**
   * Whether this form collected the category-guided answers.
   *
   * The guided wizard sets it, so its answer set (even an empty one) is written
   * verbatim and stale answers from a previous category are cleared. The
   * single-page edit form leaves it off: it never shows the questions, so the
   * `answers` key is omitted entirely and stored answers stay untouched.
   */
  readonly includeAnswers?: boolean;
};

/** Validate and normalize a form value into a `DraftTaskInput`, or return field errors. */
export function validateTaskDraftForm(
  form: TaskDraftFormValue,
  options: ValidateTaskDraftOptions = {},
): { ok: true; draft: DraftTaskInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!form.landmark.trim()) {
    errors.landmark = "Add a public landmark or suburb.";
  }
  if (!form.cityCode) {
    errors.cityCode = "Select the city or municipality.";
  }
  if (!form.barangayCode) {
    errors.barangayCode = "Select the barangay.";
  }
  if (!form.exactAddress.trim()) {
    errors.exactAddress = "Choose a location with an exact address.";
  }

  const budgetCentavos = Math.round(Number(form.budget.replace(/[^\d.]/g, "")) * 100);
  const scheduledForIso = normalizeSchedule(form.scheduledFor);
  const parsed = createTaskSchema.safeParse({
    categoryId: form.categoryId ?? "",
    title: form.title,
    description: form.description,
    budgetCentavos: Number.isFinite(budgetCentavos) ? budgetCentavos : -1,
    scheduledFor: scheduledForIso ?? undefined,
    sameDay: form.sameDay,
    timeOfDay: form.timeOfDay,
    locationType: form.locationType,
    publicLocation: {
      cityCode: form.cityCode ?? "",
      barangayCode: form.barangayCode ?? "",
      landmark: form.landmark,
      approximateLat: form.approximateLat,
      approximateLng: form.approximateLng,
      // An empty field is an absence, not a value: normalize to null so the
      // schema's landmark rules only ever see a real label.
      dropoffLandmark: form.dropoffLandmark.trim() ? form.dropoffLandmark.trim() : null,
    },
    privateLocation: {
      exactAddress: form.exactAddress,
      exactLat: form.exactLat,
      exactLng: form.exactLng,
    },
    media: form.media.map((m) => ({ storagePath: m.storagePath, kind: m.kind })),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const root = String(issue.path[0]);
      const sub = String(issue.path[1] ?? "");
      const key =
        root === "publicLocation"
          ? sub === "cityCode" || sub === "barangayCode"
            ? sub
            : "landmark"
          : root === "privateLocation"
            ? "exactAddress"
            : root;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  if (Object.keys(errors).length > 0) {
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
      timeOfDay: parsed.data.timeOfDay ?? null,
      locationType: parsed.data.locationType,
      landmark: parsed.data.publicLocation.landmark,
      dropoffLandmark: parsed.data.publicLocation.dropoffLandmark ?? null,
      cityCode: parsed.data.publicLocation.cityCode,
      barangayCode: parsed.data.publicLocation.barangayCode,
      approximateLat: parsed.data.publicLocation.approximateLat,
      approximateLng: parsed.data.publicLocation.approximateLng,
      exactAddress: parsed.data.privateLocation.exactAddress,
      exactLat: parsed.data.privateLocation.exactLat,
      exactLng: parsed.data.privateLocation.exactLng,
      media: form.media,
      // Omitted (not set to undefined) when this form did not collect answers,
      // so the repositories leave any stored answers alone.
      ...(options.includeAnswers ? { answers: answersForSubmit(form) } : {}),
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

/** Display labels for the coarse time-of-day options. */
const TIME_OF_DAY_LABELS: Record<TaskTimeOfDay, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Human label for a stored time-of-day, or null when the Client is flexible. */
export function timeOfDayLabel(value: TaskTimeOfDay | null | undefined): string | null {
  return value ? TIME_OF_DAY_LABELS[value] : null;
}
