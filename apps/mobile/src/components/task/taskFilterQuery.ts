import { taskSearchSchema } from "@dizkarte/domain";

/**
 * Framework-free discovery filter/query logic shared by `TaskFilterPanel`
 * (the form) and `app/map/nearby.tsx` (route param parsing). Kept free of
 * any `react-native` import so it can be unit tested under plain Node
 * without pulling in the RN/Flow-typed renderer.
 */

export type TaskFeedSort = "newest" | "highest_budget" | "nearby";

/**
 * Deterministic development-only reference areas used to anchor a
 * distance/"nearby" filter. Each center is an approximate public landmark —
 * never a user's or task's exact coordinate — and is always presented with
 * an explicit "approximate" label. This lets radius/nearest filtering
 * actually change results (it needs *some* `nearLat`/`nearLng` origin)
 * without inventing device geolocation that isn't wired in this pass.
 */
export type ReferenceAreaId = "quezon_city" | "bgc_taguig";

export type ReferenceArea = {
  readonly id: ReferenceAreaId;
  readonly label: string;
  readonly approximateLat: number;
  readonly approximateLng: number;
};

export const DEV_REFERENCE_AREAS: ReadonlyArray<ReferenceArea> = [
  {
    id: "quezon_city",
    label: "Quezon City (approximate)",
    approximateLat: 14.676,
    approximateLng: 121.0437,
  },
  {
    id: "bgc_taguig",
    label: "BGC, Taguig (approximate)",
    approximateLat: 14.5507,
    approximateLng: 121.0494,
  },
];

export function findReferenceArea(id: string | undefined): ReferenceArea | undefined {
  return DEV_REFERENCE_AREAS.find((area) => area.id === id);
}

export type TaskFilterState = {
  readonly categoryId?: string;
  readonly minBudgetCentavos?: number;
  readonly maxBudgetCentavos?: number;
  readonly sameDayOnly?: boolean;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly areaId?: ReferenceAreaId;
  readonly radiusKm?: number;
  readonly sort: TaskFeedSort;
};

export const DEFAULT_TASK_FILTERS: TaskFilterState = { sort: "newest" };

export const SORT_OPTIONS: ReadonlyArray<{ key: TaskFeedSort; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "highest_budget", label: "Highest budget" },
  { key: "nearby", label: "Distance (nearest)" },
];

/**
 * Validates a draft filter form against the shared `taskSearchSchema` bounds
 * (min/max budget, radius, schedule datetimes) plus the cross-field rules
 * the schema does not itself express (min<=max, from<=to) before it is
 * applied, so the mobile feed/map never sends a query the backend contract
 * would also reject.
 */
export function validateTaskFilterDraft(draft: {
  minBudget: string;
  maxBudget: string;
  scheduledFrom: string;
  scheduledTo: string;
  radiusKm: string;
}): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const min = draft.minBudget.trim() ? Number(draft.minBudget) * 100 : undefined;
  const max = draft.maxBudget.trim() ? Number(draft.maxBudget) * 100 : undefined;
  const radius = draft.radiusKm.trim() ? Number(draft.radiusKm) : undefined;
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
  if (radius !== undefined) {
    const result = taskSearchSchema.shape.radiusKm.safeParse(radius);
    if (!result.success) errors.radiusKm = "Enter a distance between 0.5 and 100 km.";
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
  readonly minBudgetCentavos?: number;
  readonly maxBudgetCentavos?: number;
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly sameDayOnly?: boolean;
  readonly nearLat?: number;
  readonly nearLng?: number;
  readonly radiusKm?: number;
  readonly sort: TaskFeedSort;
};

/**
 * Builds a `searchOpenTasks` query, omitting any unset optional key rather
 * than setting it to `undefined` (required under `exactOptionalPropertyTypes`
 * and so an absent filter is never confused with an explicit "undefined"
 * value on the wire). This is the single builder shared by both the task
 * feed (`app/(tabs)/home.tsx`) and the approximate map
 * (`app/map/nearby.tsx`), so both surfaces always issue byte-for-byte the
 * same query for the same filter state.
 *
 * Whenever a radius or "nearest" sort is requested, the reference area's
 * approximate public center is included as `nearLat`/`nearLng` — otherwise
 * distance filtering/sorting would be a no-op with nothing to measure from.
 */
export function buildTaskSearchQuery(
  page: number,
  pageSize: number,
  keyword: string,
  filters: TaskFilterState,
): TaskSearchQuery {
  const query: TaskSearchQuery = { page, pageSize, sort: filters.sort };
  const trimmedKeyword = keyword.trim();
  const area = findReferenceArea(filters.areaId);
  const needsDistanceOrigin =
    area && (typeof filters.radiusKm === "number" || filters.sort === "nearby");
  return {
    ...query,
    ...(trimmedKeyword ? { keyword: trimmedKeyword } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(typeof filters.minBudgetCentavos === "number"
      ? { minBudgetCentavos: filters.minBudgetCentavos }
      : {}),
    ...(typeof filters.maxBudgetCentavos === "number"
      ? { maxBudgetCentavos: filters.maxBudgetCentavos }
      : {}),
    ...(filters.sameDayOnly ? { sameDayOnly: true } : {}),
    ...(filters.scheduledFrom ? { scheduledFrom: filters.scheduledFrom } : {}),
    ...(filters.scheduledTo ? { scheduledTo: filters.scheduledTo } : {}),
    ...(needsDistanceOrigin ? { nearLat: area.approximateLat, nearLng: area.approximateLng } : {}),
    ...(typeof filters.radiusKm === "number" ? { radiusKm: filters.radiusKm } : {}),
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
  if (filters.scheduledFrom || filters.scheduledTo) {
    const from = isoToDateOnly(filters.scheduledFrom) || "any";
    const to = isoToDateOnly(filters.scheduledTo) || "any";
    chips.push(`Scheduled ${from} \u2192 ${to}`);
  }
  const area = findReferenceArea(filters.areaId);
  if (area) chips.push(area.label);
  if (typeof filters.radiusKm === "number") chips.push(`Within ${filters.radiusKm} km`);
  if (filters.sort !== "newest") {
    chips.push(SORT_OPTIONS.find((o) => o.key === filters.sort)?.label ?? filters.sort);
  }
  return chips;
}
