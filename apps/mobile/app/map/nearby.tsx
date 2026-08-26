import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Icon } from "../../src/components/ui/Icon";
import { AnimatedFilterPressable } from "../../src/components/ui/AnimatedFilterPressable";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  DeniedState,
} from "../../src/components/ui/AsyncState";
import { TaskMapSurface } from "../../src/components/map/TaskMapSurface";
import { TaskFilterPanel, useActiveFilterChips } from "../../src/components/task/TaskFilterPanel";
import {
  buildTaskSearchQuery,
  type TaskFeedSort,
  type TaskFilterState,
} from "../../src/components/task/taskFilterQuery";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useConnectivity } from "../../src/providers/ConnectivityProvider";
import { getMapProvider } from "../../src/services/map/factory";
import { theme, spacing, fontSize, lineHeight, radii, MIN_TOUCH_TARGET } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

/** Opt-in device-location states for the "near me" search origin. */
type LocationState = "off" | "locating" | "denied" | "unavailable" | "on";

/** All matching items are fetched in one bounded page for the map surface. */
const MAP_PAGE_SIZE = 100;

/** Cap the search so a stalled request surfaces as an error instead of spinning forever. */
const LOAD_TIMEOUT_MS = 12000;

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
 *
 * Opt-in device location: tapping "Use my location" resolves the device's
 * coordinates and passes them to the same builder as a search origin, so the
 * same query returns a real distance per task and orders by proximity
 * (`nearby`). No radius is applied, so the matching set stays identical to the
 * feed — only ordering and the distance readout change. A denied permission or
 * an unavailable fix leaves the origin unset and the screen behaves as before.
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
    cityCode?: string;
    barangayCode?: string;
    sort?: string;
  }>();
  const { repository } = useMarketplace();
  const { retryTick, retry } = useConnectivity();
  const [items, setItems] = useState<ReadonlyArray<PublicTaskFeedItem>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<LocationState>("off");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const requestIdRef = useRef(0);

  const mapProvider = useMemo(() => getMapProvider(), []);

  // Reconstructs the applied `TaskFilterState` from route params, failing
  // safe (falling back to "unset"/default) on any malformed or out-of-range
  // value rather than throwing — a corrupted deep link must never crash
  // this screen.
  //
  // Depend on the individual primitive params, NOT the `params` object:
  // `useLocalSearchParams()` returns a fresh object every render, so keying
  // this memo on `[params]` rebuilt `filters` -> `query` -> `load` each render
  // and made the load effect re-fire in an endless loop (the screen sat on
  // "loading" forever). The rest of the app extracts primitives for the same
  // reason.
  const keyword = params.keyword ?? "";
  const routeFilters: TaskFilterState = useMemo(() => {
    const minBudget = parsePositiveInt(params.minBudgetCentavos);
    const maxBudget = parsePositiveInt(params.maxBudgetCentavos);
    const sort = parseSort(params.sort);
    const cityCode = parseLocalityCode(params.cityCode, 6);
    const barangayCode = cityCode ? parseLocalityCode(params.barangayCode, 9) : undefined;
    return {
      sort,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(typeof minBudget === "number" ? { minBudgetCentavos: minBudget } : {}),
      ...(typeof maxBudget === "number" ? { maxBudgetCentavos: maxBudget } : {}),
      ...(params.sameDayOnly === "1" ? { sameDayOnly: true } : {}),
      ...(isValidIsoDateTime(params.scheduledFrom) ? { scheduledFrom: params.scheduledFrom } : {}),
      ...(isValidIsoDateTime(params.scheduledTo) ? { scheduledTo: params.scheduledTo } : {}),
      ...(cityCode ? { cityCode } : {}),
      ...(barangayCode ? { barangayCode } : {}),
    };
  }, [
    params.categoryId,
    params.minBudgetCentavos,
    params.maxBudgetCentavos,
    params.sameDayOnly,
    params.scheduledFrom,
    params.scheduledTo,
    params.cityCode,
    params.barangayCode,
    params.sort,
  ]);

  const [filters, setFilters] = useState<TaskFilterState>(routeFilters);
  const activeChips = useActiveFilterChips(filters);

  // Keep deep-link/browser-history changes authoritative, while map-side
  // edits remain local until the route itself changes.
  useEffect(() => {
    setFilters(routeFilters);
  }, [routeFilters]);

  // The exact same builder the feed uses, so the map issues byte-for-byte
  // the same query for the same filter state (feed/map parity). Only
  // `pageSize` legitimately differs: the map fetches one bounded page large
  // enough to contain every matching item as approximate markers, rather
  // than paginating like the list view.
  const query = useMemo(
    () => buildTaskSearchQuery(1, MAP_PAGE_SIZE, keyword, filters, origin),
    [keyword, filters, origin],
  );

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState("loading");
    let settled = false;
    const timer = setTimeout(() => {
      if (settled || requestId !== requestIdRef.current) return;
      settled = true;
      setState("error");
    }, LOAD_TIMEOUT_MS);
    repository
      .searchOpenTasks(query)
      .then((result) => {
        if (settled || requestId !== requestIdRef.current) return;
        settled = true;
        clearTimeout(timer);
        setItems(result.items);
        setState("loaded");
      })
      .catch(() => {
        if (settled || requestId !== requestIdRef.current) return;
        settled = true;
        clearTimeout(timer);
        setState("error");
      });

    return () => {
      settled = true;
      clearTimeout(timer);
    };
  }, [repository, query]);

  // Opt-in: resolve the device's location and use it as the search origin.
  // Fails safe — a denied permission or an unavailable fix keeps the origin
  // unset, so the screen behaves exactly as it does today (feed-parity, no
  // distances). Works on web too (expo-location proxies navigator.geolocation).
  const useMyLocation = useCallback(async () => {
    setLocState("locating");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setOrigin(null);
        setLocState("denied");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setOrigin(null);
        setLocState("unavailable");
        return;
      }
      setOrigin({ lat: latitude, lng: longitude });
      setLocState("on");
    } catch {
      setOrigin(null);
      setLocState("unavailable");
    }
  }, []);

  const clearMyLocation = useCallback(() => {
    setOrigin(null);
    setLocState("off");
  }, []);

  const handleApplyFilters = useCallback((next: TaskFilterState) => {
    setFilters(next);
    setFilterPanelOpen(false);
  }, []);

  useEffect(() => {
    return load();
  }, [load, retryTick]);

  if (!mapProvider) {
    return (
      <Screen subPageTitle="Nearby map">
        <Stack.Screen options={{ headerShown: false }} />
        <DeniedState
          title="Map unavailable"
          description="Map view is unavailable until a map provider is configured. Browse nearby work from the task list instead."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} subPageTitle="Nearby map">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        {state === "loading" ? (
          <View style={styles.stateContainer}>
            <LoadingState label="Loading map results" />
          </View>
        ) : null}
        {state === "error" ? (
          <View style={styles.stateContainer}>
            <ErrorState onRetry={retry} />
          </View>
        ) : null}
        {state === "loaded" && items.length === 0 ? (
          <View style={styles.stateContainer}>
            <EmptyState
              title="No tasks in this area"
              description="Try widening your filters from the task list."
              actionLabel="Adjust filters"
              onAction={() => setFilterPanelOpen(true)}
            />
          </View>
        ) : null}
        {state === "loaded" && items.length > 0 ? (
          <View style={styles.mapStage}>
            <TaskMapSurface
              items={items}
              origin={origin}
              onSelectTask={(taskId) => router.push(`/task/${taskId}`)}
            />
            <View style={styles.mapActions}>
              <AnimatedFilterPressable
                selected={activeChips.length > 0}
                onPress={() => setFilterPanelOpen(true)}
                accessibilityLabel={`Open map filters${activeChips.length > 0 ? `, ${activeChips.length} active` : ""}`}
                accessibilityState={{ expanded: filterPanelOpen }}
                selectionAccessibilityState="none"
                style={styles.filterButton}
                inactiveBackgroundColor={theme.surface}
                selectedBackgroundColor={theme.primarySoft}
                inactiveBorderColor={theme.borderSubtle}
                selectedBorderColor={theme.primary}
                pressScale={0.94}
              >
                <Icon
                  name="filter"
                  size={19}
                  color={activeChips.length > 0 ? theme.primary : theme.textSecondary}
                />
                {activeChips.length > 0 ? (
                  <View style={styles.filterCountBadge}>
                    <Text style={styles.filterCountText}>{activeChips.length}</Text>
                  </View>
                ) : null}
              </AnimatedFilterPressable>
              <MapLocationButton
                active={locState === "on"}
                loading={locState === "locating"}
                onPress={locState === "on" ? clearMyLocation : () => void useMyLocation()}
              />
            </View>
            {locState === "denied" || locState === "unavailable" ? (
              <View style={styles.locationFeedback}>
                <Text style={styles.locationFeedbackText} accessibilityRole="alert">
                  {locState === "denied" ? "Location access is blocked" : "Location is unavailable"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <TaskFilterPanel
        visible={filterPanelOpen}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setFilterPanelOpen(false)}
      />
    </Screen>
  );
}

function MapLocationButton({
  active,
  loading,
  onPress,
}: {
  readonly active: boolean;
  readonly loading: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? "Clear location" : "Use my location"}
      accessibilityHint={
        active
          ? "Stops sorting tasks by your location"
          : "Sorts matching tasks by distance from your location"
      }
      accessibilityState={{ busy: loading, disabled: loading, selected: active }}
      disabled={loading}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.locationButton,
        active ? styles.locationButtonActive : null,
        pressed
          ? active
            ? styles.locationButtonActivePressed
            : styles.locationButtonPressed
          : null,
        loading ? styles.locationButtonDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : (
        <Icon
          name={active ? "close" : "map-pin"}
          size={20}
          color={active ? theme.onPrimary : theme.primary}
        />
      )}
    </Pressable>
  );
}

/**
 * Parse route params back into a `TaskFilterState`, failing safe on any
 * malformed value rather than throwing — a corrupted deep link must never crash
 * this screen.
 */
function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parseLocalityCode(value: string | undefined, length: 6 | 9): string | undefined {
  if (!value) return undefined;
  return new RegExp(`^\\d{${length}}$`).test(value) ? value : undefined;
}

function parseSort(value: string | undefined): TaskFeedSort {
  if (value === "highest_budget") return value;
  return "newest";
}

function isValidIsoDateTime(value: string | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  stateContainer: {
    flex: 1,
    padding: spacing.lg,
  },
  mapStage: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
  },
  mapActions: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 1100,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    elevation: 8,
  },
  filterButton: {
    position: "relative",
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radii.pill,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  filterCountBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: theme.surface,
    borderRadius: 9,
    backgroundColor: theme.primary,
  },
  filterCountText: {
    color: theme.onPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  locationButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.pill,
    backgroundColor: theme.surface,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  locationButtonActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  locationButtonPressed: {
    backgroundColor: theme.surfaceSubtle,
    transform: [{ scale: 0.96 }],
  },
  locationButtonActivePressed: {
    backgroundColor: theme.primaryPressed,
    transform: [{ scale: 0.96 }],
  },
  locationButtonDisabled: {
    opacity: 0.72,
  },
  locationFeedback: {
    position: "absolute",
    top: 72,
    right: spacing.md,
    zIndex: 1100,
    maxWidth: 220,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: theme.errorSoft,
    elevation: 8,
  },
  locationFeedbackText: {
    color: theme.errorOnSoft,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: "700",
  },
});
