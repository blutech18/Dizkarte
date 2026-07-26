import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { paginate, type Paginated, type MapProvider } from "@dizkarte/domain";
import type { CategoryId, TaskId } from "@dizkarte/domain";

/**
 * Deterministic synthetic task feed for development/test.
 *
 * Every item satisfies the public-safe projection contract from
 * `@dizkarte/domain` (`PublicTaskFeedItem`) — no exact address, contact, or
 * payment fields exist on this shape at all, so there is nothing private to
 * leak. Production builds never import this module for real data; it exists
 * purely so the discovery/detail/offer/map UI is fully interactive in
 * development without a live backend.
 */
function id(value: string): TaskId {
  return value as unknown as TaskId;
}
function categoryId(value: string): CategoryId {
  return value as unknown as CategoryId;
}

const SYNTHETIC_TASKS: PublicTaskFeedItem[] = [
  {
    id: id("20000000-0000-4000-8000-000000000001"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000001"),
    title: "Fix leaking kitchen faucet",
    description:
      "Faucet has been dripping for a week. Need a plumber with tools for a same-day fix.",
    budgetCentavos: 80000,
    currency: "PHP",
    status: "OPEN",
    sameDay: true,
    scheduledFor: null,
    cityCode: "137404",
    barangayCode: "137404001",
    landmark: "Near SM North EDSA",
    approximateLat: 14.657,
    approximateLng: 121.032,
    publishedAt: "2026-07-20T02:00:00.000Z",
    offerCount: 3,
  },
  {
    id: id("20000000-0000-4000-8000-000000000002"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000002"),
    title: "Assemble IKEA wardrobe",
    description: "Two-door wardrobe, instructions included. Tools provided.",
    budgetCentavos: 120000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: "2026-07-25T06:00:00.000Z",
    cityCode: "137602",
    barangayCode: "137602010",
    landmark: "Near BGC High Street",
    approximateLat: 14.551,
    approximateLng: 121.049,
    publishedAt: "2026-07-19T02:00:00.000Z",
    offerCount: 1,
  },
  {
    id: id("20000000-0000-4000-8000-000000000003"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000003"),
    title: "Deep clean 2BR condo unit",
    description:
      "Move-out cleaning for a 2-bedroom unit. Includes kitchen and bathroom deep clean.",
    budgetCentavos: 250000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: "2026-07-27T01:00:00.000Z",
    cityCode: "137404",
    barangayCode: "137404002",
    landmark: "Near Trinoma Mall",
    approximateLat: 14.653,
    approximateLng: 121.032,
    publishedAt: "2026-07-18T02:00:00.000Z",
    offerCount: 0,
  },
  {
    id: id("20000000-0000-4000-8000-000000000004"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000004"),
    title: "Move a 2-seater sofa across town",
    description: "Need help moving a sofa and a few boxes to a new unit. Have a pickup truck.",
    budgetCentavos: 150000,
    currency: "PHP",
    status: "OPEN",
    sameDay: true,
    scheduledFor: null,
    cityCode: "137404",
    barangayCode: "137404003",
    landmark: "Near Ayala Malls Cloverleaf",
    approximateLat: 14.649,
    approximateLng: 121.028,
    publishedAt: "2026-07-21T00:30:00.000Z",
    offerCount: 2,
  },
  {
    id: id("20000000-0000-4000-8000-000000000005"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000005"),
    title: "Trim overgrown hedges and mow lawn",
    description: "Small front yard, overgrown for a month. Bring your own tools.",
    budgetCentavos: 60000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: "2026-07-26T23:00:00.000Z",
    cityCode: "137602",
    barangayCode: "137602011",
    landmark: "Near Market! Market!",
    approximateLat: 14.548,
    approximateLng: 121.055,
    publishedAt: "2026-07-17T05:00:00.000Z",
    offerCount: 4,
  },
  {
    id: id("20000000-0000-4000-8000-000000000006"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000006"),
    title: "Grade 6 Math tutoring, 2 sessions this week",
    description: "Looking for a patient tutor for basic algebra and fractions review.",
    budgetCentavos: 100000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: "2026-07-28T09:00:00.000Z",
    cityCode: "137404",
    barangayCode: "137404004",
    landmark: "Near Gateway Mall",
    approximateLat: 14.62,
    approximateLng: 121.0,
    publishedAt: "2026-07-16T04:00:00.000Z",
    offerCount: 0,
  },
  {
    id: id("20000000-0000-4000-8000-000000000007"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000007"),
    title: "Pick up and deliver documents same day",
    description: "Need someone to pick up sealed documents and deliver across the city today.",
    budgetCentavos: 40000,
    currency: "PHP",
    status: "OPEN",
    sameDay: true,
    scheduledFor: null,
    cityCode: "137602",
    barangayCode: "137602012",
    landmark: "Near The Fort Strip",
    approximateLat: 14.55,
    approximateLng: 121.047,
    publishedAt: "2026-07-21T05:00:00.000Z",
    offerCount: 1,
  },
  {
    id: id("20000000-0000-4000-8000-000000000008"),
    categoryId: categoryId("30000000-0000-4000-8000-000000000008"),
    title: "Set up new Wi-Fi router and smart TV",
    description: "New router and a smart TV need setup and network configuration.",
    budgetCentavos: 70000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: "2026-07-24T08:00:00.000Z",
    cityCode: "137404",
    barangayCode: "137404005",
    landmark: "Near Eastwood City",
    approximateLat: 14.609,
    approximateLng: 121.079,
    publishedAt: "2026-07-15T03:00:00.000Z",
    offerCount: 2,
  },
];

export type TaskFeedSort = "newest" | "highest_budget" | "nearby";

export type TaskFeedQuery = {
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
  readonly nearLat?: number;
  readonly nearLng?: number;
  readonly radiusKm?: number;
  readonly sort?: TaskFeedSort;
};

/**
 * Pure filter + sort over a public-safe task list. Shared by the paginated
 * feed and the nearby-map view so both surfaces are guaranteed to reflect
 * the exact same result set (requirement: feed/map availability consistency).
 *
 * When a distance filter/sort is requested, a `MapProvider` port instance
 * (synthetic or real) supplies `distanceKm` — never a hard-coded formula
 * duplicated per-caller.
 */
export function filterAndSortTasks(
  items: ReadonlyArray<PublicTaskFeedItem>,
  query: TaskFeedQuery,
  mapProvider?: Pick<MapProvider, "distanceKm">,
): ReadonlyArray<PublicTaskFeedItem> {
  const keyword = query.keyword?.trim().toLowerCase();
  const hasDistanceFilter =
    typeof query.nearLat === "number" && typeof query.nearLng === "number" && mapProvider;
  const hasScheduleWindow =
    typeof query.scheduledFrom === "string" || typeof query.scheduledTo === "string";

  let filtered = items.filter((task) => {
    if (keyword) {
      const inTitle = task.title.toLowerCase().includes(keyword);
      const inDescription = task.description.toLowerCase().includes(keyword);
      if (!inTitle && !inDescription) return false;
    }
    if (query.categoryId && (task.categoryId as unknown as string) !== query.categoryId) {
      return false;
    }
    if (query.cityCode && task.cityCode !== query.cityCode) {
      return false;
    }
    if (query.barangayCode && task.barangayCode !== query.barangayCode) {
      return false;
    }
    if (
      typeof query.minBudgetCentavos === "number" &&
      task.budgetCentavos < query.minBudgetCentavos
    ) {
      return false;
    }
    if (
      typeof query.maxBudgetCentavos === "number" &&
      task.budgetCentavos > query.maxBudgetCentavos
    ) {
      return false;
    }
    if (query.sameDayOnly && !task.sameDay) {
      return false;
    }
    // A scheduled window filter is only meaningful against tasks that
    // actually carry a `scheduledFor` value. A task with no schedule is
    // excluded from an explicit from/to window — it never silently passes
    // through — unless the caller is explicitly asking for same-day tasks
    // (which are, by definition, unscheduled-for-a-future-date) and this
    // task matches that same-day intent.
    if (hasScheduleWindow) {
      if (!task.scheduledFor) {
        if (!(query.sameDayOnly && task.sameDay)) return false;
      } else {
        if (
          query.scheduledFrom &&
          new Date(task.scheduledFor).getTime() < new Date(query.scheduledFrom).getTime()
        ) {
          return false;
        }
        if (
          query.scheduledTo &&
          new Date(task.scheduledFor).getTime() > new Date(query.scheduledTo).getTime()
        ) {
          return false;
        }
      }
    }
    if (hasDistanceFilter && typeof query.radiusKm === "number") {
      const distance = mapProvider!.distanceKm(
        { lat: query.nearLat!, lng: query.nearLng! },
        { lat: task.approximateLat, lng: task.approximateLng },
      );
      if (distance > query.radiusKm) return false;
    }
    return true;
  });

  const sort = query.sort ?? "newest";
  if (sort === "highest_budget") {
    filtered = [...filtered].sort((a, b) => b.budgetCentavos - a.budgetCentavos);
  } else if (sort === "nearby" && hasDistanceFilter) {
    filtered = [...filtered].sort((a, b) => {
      const distanceA = mapProvider!.distanceKm(
        { lat: query.nearLat!, lng: query.nearLng! },
        { lat: a.approximateLat, lng: a.approximateLng },
      );
      const distanceB = mapProvider!.distanceKm(
        { lat: query.nearLat!, lng: query.nearLng! },
        { lat: b.approximateLat, lng: b.approximateLng },
      );
      return distanceA - distanceB;
    });
  } else {
    filtered = [...filtered].sort(
      (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
    );
  }

  return filtered;
}

export async function searchOpenTasksSynthetic(
  query: TaskFeedQuery,
  mapProvider?: Pick<MapProvider, "distanceKm">,
): Promise<Paginated<PublicTaskFeedItem>> {
  await simulateNetwork();
  const filtered = filterAndSortTasks(SYNTHETIC_TASKS, query, mapProvider);
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize);
  return paginate(items, query.page, query.pageSize, filtered.length);
}

export async function getPublicTaskSynthetic(taskId: TaskId): Promise<PublicTaskFeedItem | null> {
  await simulateNetwork();
  return SYNTHETIC_TASKS.find((task) => task.id === taskId) ?? null;
}

/**
 * The full deterministic synthetic catalog. Consumed by the synthetic
 * repository's `searchOpenTasks` so newly published Client tasks and the
 * built-in seed set share one filter/sort pass (feed/map parity), and by
 * tests asserting against the known fixture set.
 */
export function listAllSyntheticTasks(): ReadonlyArray<PublicTaskFeedItem> {
  return SYNTHETIC_TASKS;
}

function simulateNetwork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300));
}
