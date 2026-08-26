import { TEXT_LIMITS } from "@dizkarte/config";

/** The reference flow's minimum brief-description length before a quote can be requested. */
export const MIN_QUOTE_DESCRIPTION = 25;

/**
 * Turn a quote brief into task-wizard params.
 *
 * Kept in its own framework-free module (the convention used by
 * `taskFilterQuery.ts` and `bookingStatusPresentation.ts`) so the gate and the
 * truncation are testable without a React Native transform.
 *
 * The description doubles as the task TITLE, so an over-long brief is truncated
 * here rather than rejected by the wizard one screen later. Returns null when the
 * brief is too short to act on, which is what disables the sheet's submit.
 */
export function buildQuoteTaskParams(
  description: string,
  categoryId: string | null,
): { readonly title: string; readonly category?: string } | null {
  const trimmed = description.trim();
  if (trimmed.length < MIN_QUOTE_DESCRIPTION) return null;
  const title = trimmed.slice(0, TEXT_LIMITS.taskTitleMax);
  return categoryId ? { title, category: categoryId } : { title };
}
