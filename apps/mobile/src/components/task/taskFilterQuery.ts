import { taskSearchSchema } from "@dizkarte/domain";

/**
 * Framework-free discovery filter/query logic shared by `TaskFilterPanel`
 * (the form) and `app/map/nearby.tsx` (route param parsing). Kept free of
 * any `react-native` import so it can be unit tested under plain Node
 * without pulling in the RN/Flow-typed renderer.
 */

export type TaskFeedSort = "newest" | "highest_budget" | "nearby";

export type TaskFilterState = {
  readonly categoryId?: string;
  readonly minBudgetCentavos?: number;
  readonly maxBudgetCentavos?: number;
  readonly sameDayOnly?: boolean;
  /** Supply-side filter: only tasks nobody has quoted yet. */
  readonly noOffersOnly?: boolean;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  /** Canonical 6-digit PSGC city/municipality code used by task search. */
  readonly cityCode?: string;
  /** Display-only locality label retained for the applied-filter summary. */
  readonly cityName?: string;
  /** Canonical 9-digit PSGC barangay code, scoped to `cityCode`. */
  readonly barangayCode?: string;
  /** Display-only barangay label retained for the applied-filter summary. */
  readonly barangayName?: string;
  readonly sort: TaskFeedSort;
};

export const DEFAULT_TASK_FILTERS: TaskFilterState = { sort: "newest" };

/** Sorts that remain truthful without a coordinate-bearing search origin. */
export const SORT_OPTIONS: ReadonlyArray<{ key: TaskFeedSort; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "highest_budget", label: "Highest budget" },
];

/**
 * Validates a draft filter form against the shared `taskSearchSchema` bounds
 * (min/max budget and schedule datetimes) plus the cross-field rules the
 * schema does not itself express (min<=max, from<=to) before it is
 * applied, so the mobile feed/map never sends a query the backend contract
 * would also reject.
 */
export function validateTaskFilterDraft(draft: {
  minBudget: string;
  maxBudget: string;
  scheduledFrom: string;
  scheduledTo: string;
}): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const min = draft.minBudget.trim() ? Number(draft.minBudget) * 100 : undefined;
  const max = draft.maxBudget.trim() ? Number(draft.maxBudget) * 100 : undefined;
  const scheduledFrom = draft.scheduledFrom.trim() ? toIsoDateTime(draft.scheduledFrom) : undefined;
  const scheduledTo = draft.scheduledTo.trim() ? toIsoDateTime(draft.scheduledTo) : undefined;

  if (min !== undefined) {
    const result = taskSearchSchema.shape.minBudgetCentavos.safeParse(Math.round(min));
    if (!result.success) errors.minBudget = "Enter a valid minimum budget in PHP.";
  }
  if (max !== undefined) {
    const result = taskSearchSchema.shape.maxBudgetCentavos.safeParse(Math.round(max));
    if (!result.success) errors.maxBudget = "Enter a valid maximum budget in PHP.";
  }
  if (min !== undefined && max !== undefined && min > max) {
    errors.maxBudget = "Maximum budget must be greater than or equal to the minimum.";
  }
  if (draft.scheduledFrom.trim() && (scheduledFrom === undefined || Number.isNaN(scheduledFrom))) {
    errors.scheduledFrom = "Enter a valid from date.";
  }
  if (draft.scheduledTo.trim() && (scheduledTo === undefined || Number.isNaN(scheduledTo))) {
    errors.scheduledTo = "Enter a valid to date.";
  }
  if (
    typeof scheduledFrom === "number" &&
    !Number.isNaN(scheduledFrom) &&
    typeof scheduledTo === "number" &&
    !Number.isNaN(scheduledTo) &&
    scheduledFrom > scheduledTo
  ) {
    errors.scheduledTo = "\u201cTo\u201d date must be on or after the \u201cfrom\u201d date.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true };
}

/** Parses a `YYYY-MM-DD` local date field into a UTC-midnight epoch ms, or `NaN` if unparsable. */
export function toIsoDateTime(dateOnly: string): number {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateOnly.trim());
  if (!match) return Number.NaN;
  const parsed = new Date(`${dateOnly.trim()}T00:00:00.000Z`);
  return parsed.getTime();
}

export function dateOnlyToIso(dateOnly: string, endOfDay: boolean): string | undefined {
  const trimmed = dateOnly.trim();
  if (!trimmed) return undefined;
  const time = toIsoDateTime(trimmed);
  if (Number.isNaN(time)) return undefined;
  const offsetMs = endOfDay ? 24 * 60 * 60 * 1000 - 1 : 0;
  return new Date(time + offsetMs).toISOString();
}

export function isoToDateOnly(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export type TaskSearchQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly keyword?: string;
  readonly categoryId?: string;
  readonly cityCode?: string;
  readonly barangayCode?: string;
  readonly minBudgetCentavos?: number;
  readonly maxBudgetCentavos?: number;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly sameDayOnly?: boolean;
  readonly noOffersOnly?: boolean;
  /** Search origin latitude; present only for a coordinate-bearing "near me" search. */
  readonly nearLat?: number;
  /** Search origin longitude; paired with `nearLat`. */
  readonly nearLng?: number;
  /** Optional radius (km) around the origin; omitted here so the result set stays feed-parity. */
  readonly radiusKm?: number;
  readonly sort: TaskFeedSort;
};

/**
 * Builds a `searchOpenTasks` query, omitting any unset optional key rather
 * than setting it to `undefined` (required under `exactOptionalPropertyTypes`
 * and so an absent filter is never confused with an explicit `undefined`
 * value on the wire). Browse and the map both use this builder, preserving
 * result parity for dynamic PSGC city and barangay filters.
 *
 * An optional coordinate `origin` (e.g. the device's current location) makes
 * distance meaningful: when a finite origin is supplied the query switches to
 * the `nearby` sort and carries `nearLat`/`nearLng`, so results come back with
 * a real distance and ordered by proximity. No radius is applied, so *which*
 * tasks match is unchanged from the feed — only their order and the distance
 * readout differ. Without an origin the caller's chosen sort stands and no geo
 * key is emitted.
 */
export function buildTaskSearchQuery(
  page: number,
  pageSize: number,
  keyword: string,
  filters: TaskFilterState,
  origin?: { readonly lat: number; readonly lng: number } | null,
): TaskSearchQuery {
  const trimmedKeyword = keyword.trim();
  const originPart =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? { nearLat: origin.lat, nearLng: origin.lng }
      : undefined;
  return {
    page,
    pageSize,
    sort: originPart ? "nearby" : filters.sort,
    ...(trimmedKeyword ? { keyword: trimmedKeyword } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.cityCode ? { cityCode: filters.cityCode } : {}),
    ...(filters.barangayCode ? { barangayCode: filters.barangayCode } : {}),
    ...(typeof filters.minBudgetCentavos === "number"
      ? { minBudgetCentavos: filters.minBudgetCentavos }
      : {}),
    ...(typeof filters.maxBudgetCentavos === "number"
      ? { maxBudgetCentavos: filters.maxBudgetCentavos }
      : {}),
    ...(filters.sameDayOnly ? { sameDayOnly: true } : {}),
    ...(filters.noOffersOnly ? { noOffersOnly: true } : {}),
    ...(filters.scheduledFrom ? { scheduledFrom: filters.scheduledFrom } : {}),
    ...(filters.scheduledTo ? { scheduledTo: filters.scheduledTo } : {}),
    ...(originPart ?? {}),
  };
}

/**
 * Human-readable chip summary of every applied filter, used by the feed
 * header. Takes an optional category-name lookup so this module does not
 * itself depend on the synthetic category catalog.
 */
export function describeActiveFilters(
  filters: TaskFilterState,
  categoryName: (categoryId: string) => string | undefined,
): ReadonlyArray<string> {
  const chips: string[] = [];
  if (filters.categoryId) {
    chips.push(categoryName(filters.categoryId) ?? "Category");
  }
  if (typeof filters.minBudgetCentavos === "number") {
    chips.push(`Min \u20b1${(filters.minBudgetCentavos / 100).toFixed(2)}`);
  }
  if (typeof filters.maxBudgetCentavos === "number") {
    chips.push(`Max \u20b1${(filters.maxBudgetCentavos / 100).toFixed(2)}`);
  }
  if (filters.sameDayOnly) chips.push("Same-day only");
  if (filters.noOffersOnly) chips.push("No offers yet");
  if (filters.scheduledFrom || filters.scheduledTo) {
    const from = isoToDateOnly(filters.scheduledFrom) || "any";
    const to = isoToDateOnly(filters.scheduledTo) || "any";
    chips.push(`Scheduled ${from} \u2192 ${to}`);
  }
  if (filters.cityCode) {
    chips.push(filters.cityName ?? "City / municipality");
  }
  if (filters.barangayCode) {
    chips.push(filters.barangayName ?? "Barangay");
  }
  if (filters.sort !== "newest") {
    chips.push(SORT_OPTIONS.find((option) => option.key === filters.sort)?.label ?? filters.sort);
  }
  return chips;
}
