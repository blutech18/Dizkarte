import type { TaskDraftFormValue } from "./taskDraftValue";

/**
 * Step definition and per-step validation for the guided task-posting flow.
 *
 * Kept free of React Native imports so the rules are unit-testable. Each step's
 * validation mirrors the corresponding constraint in `createTaskSchema`, so a
 * step can never be passed only to have the final submit reject the same value —
 * the user is told at the point they can still fix it.
 */

export const WIZARD_STEP_IDS = [
  "category",
  "title",
  "description",
  "budget",
  "schedule",
  "location",
  "review",
] as const;

export type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

/** Mirrors `createTaskSchema` and `@dizkarte/config` limits. */
const TITLE_MIN = 5;
const TITLE_MAX = 120;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 4000;
const MIN_BUDGET_CENTAVOS = 2000;
const MAX_BUDGET_CENTAVOS = 100_000_000;
const LANDMARK_MAX = 200;
const ADDRESS_MAX = 500;

/**
 * The steps to show.
 *
 * The category step is dropped when the Client arrived from a category tile on
 * Home — re-asking for something they just chose is friction, and the value is
 * still editable from the review step.
 */
export function stepsFor(categoryPreselected: boolean): ReadonlyArray<WizardStepId> {
  return WIZARD_STEP_IDS.filter((id) => id !== "category" || !categoryPreselected);
}

/** Parse the budget field into centavos. Returns null when not a usable number. */
export function budgetToCentavos(input: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (cleaned.trim() === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Validation message for a step, or null when the step is satisfied.
 *
 * `review` has no rules of its own: it is a confirmation of already-valid steps.
 */
export function validateStep(step: WizardStepId, form: TaskDraftFormValue): string | null {
  switch (step) {
    case "category":
      return form.categoryId ? null : "Choose a category to continue.";

    case "title": {
      const title = form.title.trim();
      if (title.length === 0) return "Give your task a title.";
      if (title.length < TITLE_MIN) return `Use at least ${TITLE_MIN} characters.`;
      if (title.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`;
      return null;
    }

    case "description": {
      const description = form.description.trim();
      if (description.length === 0) return "Describe what needs to be done.";
      if (description.length < DESCRIPTION_MIN) {
        return `Add a little more detail — at least ${DESCRIPTION_MIN} characters.`;
      }
      if (description.length > DESCRIPTION_MAX) {
        return `Keep the description under ${DESCRIPTION_MAX} characters.`;
      }
      return null;
    }

    case "budget": {
      const centavos = budgetToCentavos(form.budget);
      if (centavos === null) return "Enter your budget.";
      if (centavos < MIN_BUDGET_CENTAVOS) return "Budget must be at least ₱20.00.";
      if (centavos > MAX_BUDGET_CENTAVOS) return "That budget is too large.";
      return null;
    }

    case "schedule": {
      // A same-day task needs no date. Otherwise a date is optional (flexible),
      // but anything entered must be a real date.
      if (form.sameDay) return null;
      const raw = form.scheduledFor.trim();
      if (raw.length === 0) return null;
      if (Number.isNaN(new Date(raw).getTime())) {
        return "Use a date we can read, for example 2026-08-14 09:00.";
      }
      return null;
    }

    case "location": {
      const landmark = form.landmark.trim();
      const address = form.exactAddress.trim();
      if (landmark.length === 0) return "Add a public landmark so Taskers know the area.";
      if (landmark.length > LANDMARK_MAX) return `Keep the landmark under ${LANDMARK_MAX} characters.`;
      if (address.length === 0) return "Add the exact address. It stays private until you book.";
      if (address.length > ADDRESS_MAX) return `Keep the address under ${ADDRESS_MAX} characters.`;
      return null;
    }

    case "review":
      return null;
  }
}

/** Whether the Continue button on a step should be enabled. */
export function canContinue(step: WizardStepId, form: TaskDraftFormValue): boolean {
  return validateStep(step, form) === null;
}

/** 1-based position, for "Step 2 of 6" and the progress bar. */
export function stepProgress(
  steps: ReadonlyArray<WizardStepId>,
  current: WizardStepId,
): { readonly position: number; readonly total: number; readonly fraction: number } {
  const index = steps.indexOf(current);
  const position = index < 0 ? 1 : index + 1;
  const total = steps.length;
  return { position, total, fraction: total === 0 ? 0 : position / total };
}

/**
 * The first step that is not satisfied, or null when every step passes.
 *
 * Used when a Client jumps back from the review step: rather than trusting the
 * final submit to surface a failure, the flow returns them to the step that
 * actually needs attention.
 */
export function firstIncompleteStep(
  steps: ReadonlyArray<WizardStepId>,
  form: TaskDraftFormValue,
): WizardStepId | null {
  return steps.find((step) => validateStep(step, form) !== null) ?? null;
}
