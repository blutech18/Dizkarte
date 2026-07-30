import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  DeniedState,
} from "../../src/components/ui/AsyncState";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { Icon } from "../../src/components/ui/Icon";
import {
  buildTaskSearchQuery,
  findReferenceArea,
  type ReferenceAreaId,
  type TaskFeedSort,
  type TaskFilterState,
} from "../../src/components/task/taskFilterQuery";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useConnectivity } from "../../src/providers/ConnectivityProvider";
import { getMapProvider } from "../../src/services/map/factory";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

/** All matching items are fetched in one bounded page for the map surface. */
const MAP_PAGE_SIZE = 100;

/**
 * Approximate nearby map/schematic view.
 *
 * There is no live map SDK/credential wired into this pass (task 9.2). This
 * screen therefore never renders a real map surface: outside development/test
 * `getMapProvider()` returns `null` and this screen shows a "map unavailable"
 * denied state — it never silently substitutes synthetic markers for a
 * missing production provider. In development/test it renders a clearly
 * labeled deterministic schematic built only from `approximate` coordinates —
 * the same public-safe `PublicTaskFeedItem` shape the feed uses, so this view
 * can never see exact task locations.
 *
 * The route params serialized by `app/(tabs)/home.tsx` are parsed back into
 * a `TaskFilterState` and passed through the exact same `buildTaskSearchQuery`
 * builder the feed uses, then the exact same `searchOpenTasks` query (and
 * therefore the exact same result set/count, up to `MAP_PAGE_SIZE`) is
 * issued via the shared `MobileMarketplacePort` — this is what guarantees
 * feed/map consistency. Parsing never throws on malformed/unexpected params;
 * anything unrecognized is treated as absent rather than crashing the screen.
 */
export default function NearbyMapScreen() {
  const params = useLocalSearchParams<{
    keyword?: string;
    categoryId?: string;
    minBudgetCentavos?: string;
    maxBudgetCentavos?: string;
    sameDayOnly?: string;
    scheduledFrom?: string;
    scheduledTo?: string;
    areaId?: string;
    radiusKm?: string;
    sort?: string;
  }>();
  const { repository } = useMarketplace();
  const { retryTick, retry } = useConnectivity();
  const [items, setItems] = useState<ReadonlyArray<PublicTaskFeedItem>>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>("loading");

  const mapProvider = useMemo(() => getMapProvider(), []);

  // Reconstructs the applied `TaskFilterState` from route params, failing
  // safe (falling back to "unset"/default) on any malformed or out-of-range
  // value rather than throwing — a corrupted deep link must never crash
  // this screen.
  const keyword = params.keyword ?? "";
  const filters: TaskFilterState = useMemo(() => {
    const minBudget = parsePositiveInt(params.minBudgetCentavos);
    const maxBudget = parsePositiveInt(params.maxBudgetCentavos);
    const radius = parsePositiveFloat(params.radiusKm);
    const sort = parseSort(params.sort);
    const areaId = parseAreaId(params.areaId);
    return {
      sort,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(typeof minBudget === "number" ? { minBudgetCentavos: minBudget } : {}),
      ...(typeof maxBudget === "number" ? { maxBudgetCentavos: maxBudget } : {}),
      ...(params.sameDayOnly === "1" ? { sameDayOnly: true } : {}),
      ...(isValidIsoDateTime(params.scheduledFrom) ? { scheduledFrom: params.scheduledFrom } : {}),
      ...(isValidIsoDateTime(params.scheduledTo) ? { scheduledTo: params.scheduledTo } : {}),
      ...(areaId ? { areaId } : {}),
      ...(typeof radius === "number" ? { radiusKm: radius } : {}),
    };
  }, [params]);

  // The exact same builder the feed uses, so the map issues byte-for-byte
  // the same query for the same filter state (feed/map parity). Only
  // `pageSize` legitimately differs: the map fetches one bounded page large
  // enough to contain every matching item as approximate markers, rather
  // than paginating like the list view.
  const query = useMemo(
    () => buildTaskSearchQuery(1, MAP_PAGE_SIZE, keyword, filters),
    [keyword, filters],
  );

  const load = useCallback(() => {
    setState("loading");
    repository
      .searchOpenTasks(query)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, query]);

  useEffect(() => {
    load();
  }, [load, retryTick]);

  if (!mapProvider) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Nearby map" }} />
        <DeniedState
          title="Map unavailable"
          description="Map view is unavailable until a map provider is configured. Browse nearby work from the task list instead."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ headerShown: true, title: "Nearby map" }} />
      {/*
        Locations are intentionally approximate: the feed only ever exposes a
        rounded point, never a task's exact address. Turn-by-turn navigation is
        not part of this view.
      */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Approximate locations only — exact addresses are shared after booking
        </Text>
      </View>
      {state === "loading" ? <LoadingState label="Loading map results" /> : null}
      {state === "error" ? <ErrorState onRetry={retry} /> : null}
      {state === "loaded" && items.length === 0 ? (
        <EmptyState
          title="No tasks in this area"
          description="Try widening your filters from the task list."
        />
      ) : null}
      {state === "loaded" && items.length > 0 ? (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.countLabel}>
            {items.length} of {total} matching task{total === 1 ? "" : "s"} shown as approximate
            markers
          </Text>
          <SchematicMapSurface items={items} />
          <Button label="Back to list view" onPress={() => router.back()} variant="secondary" />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

/**
 * Deterministic schematic marker surface: each task is rendered as a labeled
 * card carrying only its approximate coordinates (never a live tile/vector
 * map SDK). This intentionally is not pixel-accurate cartography — it exists
 * to prove the map/feed consistency contract, not to provide real navigation.
 */
function SchematicMapSurface({ items }: { readonly items: ReadonlyArray<PublicTaskFeedItem> }) {
  return (
    <View
      style={styles.schematicSurface}
      accessibilityRole="list"
      accessibilityLabel="Approximate task markers"
    >
      {items.map((task) => (
        <MarkerCard key={task.id} task={task} />
      ))}
    </View>
  );
}

/**
 * Distance to the approximate area, not to the exact address.
 *
 * `search_task_feed` rounds to 100 m, so sub-kilometre values are shown in
 * hundreds of metres and anything further in one decimal of a kilometre. Never
 * presented as a precise travel distance, because the origin point is fuzzed.
 */
function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

function MarkerCard({ task }: { readonly task: PublicTaskFeedItem }) {
  const distance = task.distanceMeters === null ? null : formatDistance(task.distanceMeters);
  return (
    <View
      style={styles.markerCard}
      accessibilityRole="summary"
      accessibilityLabel={`${task.title}, approximate area ${task.landmark}${distance ? `, ${distance}` : ""}, budget ${formatPhp(task.budgetCentavos)}`}
    >
      <View style={styles.markerHeader}>
        <Icon name="map-pin" size={16} color={theme.primary} />
        <Text style={styles.markerTitle}>{task.title}</Text>
        {task.sameDay ? <StatusBadge tone="warning" label="Same-day" /> : null}
      </View>
      <Text style={styles.markerMeta}>
        {task.landmark} · {task.approximateLat.toFixed(3)}, {task.approximateLng.toFixed(3)}{" "}
        (approximate)
      </Text>
      {distance ? <Text style={styles.markerMeta}>{distance}</Text> : null}
      <View style={styles.markerFooter}>
        <Text style={styles.markerBudget}>{formatPhp(task.budgetCentavos)}</Text>
        <Button label="View task" onPress={() => router.push(`/task/${task.id}`)} variant="text" />
      </View>
    </View>
  );
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parsePositiveFloat(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseSort(value: string | undefined): TaskFeedSort {
  if (value === "newest" || value === "highest_budget" || value === "nearby") return value;
  return "newest";
}

function parseAreaId(value: string | undefined): ReferenceAreaId | undefined {
  if (!value) return undefined;
  return findReferenceArea(value)?.id;
}

function isValidIsoDateTime(value: string | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.warningSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  bannerText: {
    color: theme.warningOnSoft,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textAlign: "center",
  },
  listContent: { paddingBottom: spacing.xl, gap: spacing.md },
  countLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
  schematicSurface: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  markerCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  markerHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  markerTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary, flex: 1 },
  markerMeta: { fontSize: fontSize.xs, color: theme.textSecondary },
  markerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
  },
  markerBudget: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
});
