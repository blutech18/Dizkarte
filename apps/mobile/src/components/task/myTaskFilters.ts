import type { OwnedTaskRecord } from "../../services/marketplace/types";

/**
 * Framework-free filter logic for the Client's owned task list.
 *
 * Kept out of the panel and the screen (and free of any `react-native` import)
 * so the matching rules can be unit tested under plain Node. Every filter here
 * reads a field the owned-task record actually carries — status, category,
 * PSGC locality, schedule, budget, and offer count — so nothing in the sheet
 * promises a filter the data cannot honour.
 */

export type MyTaskStatusFilter =
  | "all"
  | "draft"
  | "published"
  | "assigned"
  | "completed"
  | "closed";

export type MyTaskSort = "recent" | "oldest" | "soonest" | "highest_budget";

export type MyTaskFilterState = {
  readonly status: MyTaskStatusFilter;
  readonly categoryId?: string;
  /** Canonical 6-digit PSGC city/municipality code. */
  readonly cityCode?: string;
  /** Display-only label kept for the applied-filter summary. */
  readonly cityName?: string;
  readonly barangayCode?: string;
  readonly barangayName?: string;
  /** Inclusive ISO bounds on the task's scheduled date. */
  readonly scheduledFrom?: string;
  readonly scheduledTo?: string;
  readonly minBudgetCentavos?: number;
  readonly maxBudgetCentavos?: number;
  /** Only tasks that still have offers waiting for a decision. */
  readonly withOffersOnly?: boolean;
  readonly sameDayOnly?: boolean;
  readonly sort: MyTaskSort;
};

export const DEFAULT_MY_TASK_FILTERS: MyTaskFilterState = { status: "all", sort: "recent" };

export const MY_TASK_STATUS_FILTERS: ReadonlyArray<{
  readonly key: MyTaskStatusFilter;
  readonly label: string;
  readonly icon: "note" | "edit" | "briefcase" | "user" | "check-circle" | "close";
}> = [
  { key: "all", label: "All statuses", icon: "note" },
  { key: "draft", label: "Draft", icon: "edit" },
  { key: "published", label: "Published", icon: "briefcase" },
  { key: "assigned", label: "Assigned", icon: "user" },
  { key: "completed", label: "Completed", icon: "check-circle" },
  { key: "closed", label: "Closed", icon: "close" },
];

export const MY_TASK_SORT_OPTIONS: ReadonlyArray<{
  readonly key: MyTaskSort;
  readonly label: string;
}> = [
  { key: "recent", label: "Recently updated" },
  { key: "oldest", label: "Oldest first" },
  { key: "soonest", label: "Soonest scheduled" },
  { key: "highest_budget", label: "Highest budget" },
];

/** Which lifecycle statuses each queue bucket covers. */
export function matchesMyTaskStatus(status: OwnedTaskRecord["status"], filter: MyTaskStatusFilter) {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return status === "DRAFT";
    case "published":
      return status === "OPEN" || status === "BOOKING_PENDING";
    case "assigned":
      return status === "ASSIGNED" || status === "IN_PROGRESS" || status === "COMPLETION_REQUESTED";
    case "completed":
      return status === "COMPLETED";
    case "closed":
      return (
        status === "EXPIRED" ||
        status === "CANCELLED" ||
        status === "DISPUTED" ||
        status === "REMOVED"
      );
  }
}

function withinDateRange(value: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  // A task with no date cannot satisfy a date range; excluding it is the honest
  // answer, because "flexible" is not evidence that it falls inside the window.
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from) {
    const fromTime = new Date(from).getTime();
    if (!Number.isNaN(fromTime) && time < fromTime) return false;
  }
  if (to) {
    const toTime = new Date(to).getTime();
    if (!Number.isNaN(toTime) && time > toTime) return false;
  }
  return true;
}

/** True when a task satisfies every applied filter and the keyword search. */
export function matchesMyTaskFilters(
  task: OwnedTaskRecord,
  filters: MyTaskFilterState,
  keyword = "",
): boolean {
  if (!matchesMyTaskStatus(task.status, filters.status)) return false;

  const draft = task.draft;
  if (filters.categoryId && draft.categoryId !== filters.categoryId) return false;
  if (filters.cityCode && draft.cityCode !== filters.cityCode) return false;
  if (filters.barangayCode && draft.barangayCode !== filters.barangayCode) return false;
  if (filters.sameDayOnly && !draft.sameDay) return false;

  // Offers can only still be acted on while the task is open for them.
  if (filters.withOffersOnly && !(task.status === "OPEN" && task.offerCount > 0)) return false;

  if (
    typeof filters.minBudgetCentavos === "number" &&
    draft.budgetCentavos < filters.minBudgetCentavos
  ) {
    return false;
  }
  if (
    typeof filters.maxBudgetCentavos === "number" &&
    draft.budgetCentavos > filters.maxBudgetCentavos
  ) {
    return false;
  }

  if (!withinDateRange(draft.scheduledFor ?? null, filters.scheduledFrom, filters.scheduledTo)) {
    return false;
  }

  const trimmed = keyword.trim().toLowerCase();
  if (trimmed.length > 0) {
    const haystack = `${draft.title ?? ""} ${draft.description ?? ""}`.toLowerCase();
    if (!haystack.includes(trimmed)) return false;
  }

  return true;
}

function timeOf(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
}

/** Stable sort; tasks with no scheduled date sort last under "soonest". */
export function sortMyTasks(
  tasks: ReadonlyArray<OwnedTaskRecord>,
  sort: MyTaskSort,
): ReadonlyArray<OwnedTaskRecord> {
  const copy = [...tasks];
  switch (sort) {
    case "recent":
      return copy.sort((a, b) => (timeOf(b.updatedAt) || 0) - (timeOf(a.updatedAt) || 0));
    case "oldest":
      return copy.sort((a, b) => (timeOf(a.createdAt) || 0) - (timeOf(b.createdAt) || 0));
    case "highest_budget":
      return copy.sort((a, b) => b.draft.budgetCentavos - a.draft.budgetCentavos);
    case "soonest":
      return copy.sort((a, b) => {
        const left = timeOf(a.draft.scheduledFor);
        const right = timeOf(b.draft.scheduledFor);
        if (Number.isNaN(left) && Number.isNaN(right)) return 0;
        if (Number.isNaN(left)) return 1;
        if (Number.isNaN(right)) return -1;
        return left - right;
      });
  }
}

/**
 * Per-status counts for the sheet badges.
 *
 * Counted against every *other* applied filter, so a badge always states how
 * many tasks that option would actually reveal.
 */
export function countMyTasksByStatus(
  tasks: ReadonlyArray<OwnedTaskRecord>,
  filters: MyTaskFilterState,
  keyword = "",
): Readonly<Record<MyTaskStatusFilter, number>> {
  const counts: Record<MyTaskStatusFilter, number> = {
    all: 0,
    draft: 0,
    published: 0,
    assigned: 0,
    completed: 0,
    closed: 0,
  };
  for (const option of MY_TASK_STATUS_FILTERS) {
    counts[option.key] = tasks.filter((task) =>
      matchesMyTaskFilters(task, { ...filters, status: option.key }, keyword),
    ).length;
  }
  return counts;
}

/**
 * Per-category counts for the sheet badges.
 *
 * Counted against every *other* applied filter, so a badge always states how
 * many tasks that category option would actually reveal.
 */
export function countMyTasksByCategory(
  tasks: ReadonlyArray<OwnedTaskRecord>,
  categories: ReadonlyArray<{ readonly id: string }>,
  filters: MyTaskFilterState,
  keyword = "",
): Readonly<Record<string, number>> & { readonly all: number } {
  // The "all" badge counts with the category filter cleared. The key is dropped
  // rather than set to `undefined`, which `exactOptionalPropertyTypes` rejects;
  // `matchesMyTaskFilters` treats an absent and an undefined category the same.
  // Rebuilt by rest-destructuring because `categoryId` is readonly.
  const { categoryId: _clearedCategory, ...withoutCategory } = filters;
  const counts: Record<string, number> = {
    all: tasks.filter((task) => matchesMyTaskFilters(task, withoutCategory, keyword)).length,
  };
  for (const category of categories) {
    counts[category.id] = tasks.filter((task) =>
      matchesMyTaskFilters(task, { ...filters, categoryId: category.id }, keyword),
    ).length;
  }
  return counts as Readonly<Record<string, number>> & { readonly all: number };
}

/** Number of applied filters, for the badge on the filter button. */
export function activeMyTaskFilterCount(filters: MyTaskFilterState): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.categoryId) count += 1;
  if (filters.cityCode) count += 1;
  if (filters.barangayCode) count += 1;
  if (filters.scheduledFrom || filters.scheduledTo) count += 1;
  if (typeof filters.minBudgetCentavos === "number") count += 1;
  if (typeof filters.maxBudgetCentavos === "number") count += 1;
  if (filters.withOffersOnly) count += 1;
  if (filters.sameDayOnly) count += 1;
  if (filters.sort !== "recent") count += 1;
  return count;
}

/** Chip labels summarising the applied filters. */
export function describeMyTaskFilters(
  filters: MyTaskFilterState,
  categoryName: (categoryId: string) => string | undefined,
): ReadonlyArray<string> {
  const chips: string[] = [];
  if (filters.status !== "all") {
    chips.push(
      MY_TASK_STATUS_FILTERS.find((option) => option.key === filters.status)?.label ??
        filters.status,
    );
  }
  if (filters.categoryId) chips.push(categoryName(filters.categoryId) ?? "Category");
  if (filters.barangayCode) chips.push(filters.barangayName ?? "Barangay");
  else if (filters.cityCode) chips.push(filters.cityName ?? "City / municipality");
  if (filters.sameDayOnly) chips.push("Needed today");
  if (filters.withOffersOnly) chips.push("Has offers to review");
  if (typeof filters.minBudgetCentavos === "number") {
    chips.push(`Min \u20b1${(filters.minBudgetCentavos / 100).toFixed(2)}`);
  }
  if (typeof filters.maxBudgetCentavos === "number") {
    chips.push(`Max \u20b1${(filters.maxBudgetCentavos / 100).toFixed(2)}`);
  }
  if (filters.scheduledFrom || filters.scheduledTo) {
    const from = filters.scheduledFrom ? filters.scheduledFrom.slice(0, 10) : "any";
    const to = filters.scheduledTo ? filters.scheduledTo.slice(0, 10) : "any";
    chips.push(`Scheduled ${from} \u2192 ${to}`);
  }
  if (filters.sort !== "recent") {
    chips.push(
      MY_TASK_SORT_OPTIONS.find((option) => option.key === filters.sort)?.label ?? filters.sort,
    );
  }
  return chips;
}
