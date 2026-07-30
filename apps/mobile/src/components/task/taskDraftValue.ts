import { createTaskSchema } from "@dizkarte/domain";
import type { DraftTaskInput, TaskMediaAttachment } from "../../services/marketplace/types";

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

/**
 * Locality and coordinate defaults.
 *
 * Task creation does not yet capture a map pin, so the approximate and exact
 * points fall back to a fixed Quezon City reference. These become real values
 * once a map provider is configured; the codes are numeric PSGC so they satisfy
 * `localityCodeSchema` and match what the seeded catalog uses.
 */
const DEFAULT_CITY_CODE = "137404";
const DEFAULT_BARANGAY_CODE = "137404001";
const DEFAULT_APPROX_LAT = 14.657;
const DEFAULT_APPROX_LNG = 121.032;
const DEFAULT_EXACT_LAT = 14.6575;
const DEFAULT_EXACT_LNG = 121.0322;

/** Validate and normalize a form value into a `DraftTaskInput`, or return field errors. */
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
