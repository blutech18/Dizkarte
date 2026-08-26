import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import type { PublicTaskFeedItem, TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../ui/Screen";
import { AppHeader } from "../ui/AppHeader";
import { Button } from "../ui/Button";
import { AnimatedFilterPressable } from "../ui/AnimatedFilterPressable";
import { LoadingState, EmptyState, ErrorState } from "../ui/AsyncState";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import {
  TaskFilterPanel,
  DEFAULT_TASK_FILTERS,
  useActiveFilterChips,
  buildTaskSearchQuery,
  type TaskFilterState,
} from "./TaskFilterPanel";
import { resolveTaskCardDestination } from "./taskCardNavigation";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { useSession } from "../../providers/SessionProvider";
import { useConnectivity } from "../../providers/ConnectivityProvider";
import { useCategories } from "../../providers/CategoriesProvider";
import { getMapProvider } from "../../services/map/factory";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  noWebOutline,
} from "../../theme";

type LoadState = "loading" | "loaded" | "error";

const PAGE_SIZE = 20;

/** Approved-Tasker discovery feed shown on the Browse tab. */
export function TaskerDiscoveryFeed() {
  const { retryTick, isAppActive } = useConnectivity();
  const { repository } = useMarketplace();
  const { session } = useSession();
  const viewerId = session?.userId ?? null;
  const { nameFor } = useCategories();
  // Draft keyword mirrors every keystroke; applied keyword changes only when
  // the user submits, so typing never starts a request on every key press.
  const [draftKeyword, setDraftKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_TASK_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicTaskFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [openingTaskId, setOpeningTaskId] = useState<TaskId | null>(null);
  const openingTaskRef = useRef(false);
  const listRef = useRef<FlatList<PublicTaskFeedItem>>(null);

  const distanceAvailable = useMemo(() => getMapProvider() !== null, []);

  const load = useCallback(
    async (nextKeyword: string, nextFilters: TaskFilterState, nextPage: number) => {
      setState("loading");
      try {
        const result = await repository.searchOpenTasks(
          buildTaskSearchQuery(nextPage, PAGE_SIZE, nextKeyword, nextFilters),
        );
        setItems([...result.items]);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setState("loaded");
      } catch {
        setState("error");
      }
    },
    [repository],
  );

  useEffect(() => {
    void load(appliedKeyword, filters, page);
    // `draftKeyword` is intentionally absent: only an explicit submit searches.
  }, [load, retryTick, appliedKeyword, filters, page]);

  const activeChips = useActiveFilterChips(filters);
  const hasAppliedKeyword = appliedKeyword.trim().length > 0;
  const hasActiveFilters = activeChips.length > 0 || hasAppliedKeyword;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleStart = items.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const visibleEnd = items.length > 0 ? visibleStart + items.length - 1 : 0;
  const paginationRangeLabel =
    totalPages === 1
      ? `Showing all ${total} matching task${total === 1 ? "" : "s"}`
      : `Showing ${visibleStart}–${visibleEnd} of ${total} matching tasks`;

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
    });
  }

  function handleSearchSubmit() {
    setAppliedKeyword(draftKeyword);
    setPage(1);
  }

  function handleClearSearch() {
    setDraftKeyword("");
    setAppliedKeyword("");
    setPage(1);
  }

  function handleApplyFilters(next: TaskFilterState) {
    setFilters(next);
    setPage(1);
    setFilterPanelOpen(false);
  }

  function handleClearAll() {
    setDraftKeyword("");
    setAppliedKeyword("");
    setFilters(DEFAULT_TASK_FILTERS);
    setPage(1);
  }

  const handleOpenTask = useCallback(
    async (taskId: TaskId) => {
      if (openingTaskRef.current) return;
      openingTaskRef.current = true;
      setOpeningTaskId(taskId);

      try {
        const destination = await resolveTaskCardDestination(repository, taskId, viewerId);
        if (destination === "owned") {
          router.push({ pathname: "/task/[id]/owned", params: { id: taskId } });
        } else {
          router.push({
            pathname: "/task/[id]",
            params: {
              id: taskId,
              ...(viewerId ? { ownershipChecked: "1" } : {}),
            },
          });
        }
      } catch {
        Alert.alert(
          "Could not open task",
          "We couldn't confirm the correct task view. Check your connection and try again.",
        );
      } finally {
        openingTaskRef.current = false;
        setOpeningTaskId(null);
      }
    },
    [repository, viewerId],
  );

  const listHeader = (
    <View style={styles.header}>
      <AppHeader title="Browse work" subtitle="Discover open tasks that fit your skills" />

      <View style={styles.controlsCard}>
        <View style={styles.searchFilterRow}>
          <View
            style={[
              styles.searchInputWrapper,
              searchFocused ? styles.searchInputWrapperFocused : null,
            ]}
          >
            <Icon
              name="search"
              size={18}
              color={searchFocused ? theme.primary : theme.textSecondary}
            />
            <TextInput
              value={draftKeyword}
              onChangeText={setDraftKeyword}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={handleSearchSubmit}
              placeholder="Search tasks"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              autoCorrect={false}
              spellCheck={false}
              style={[styles.searchInput, noWebOutline]}
              accessibilityLabel="Search open tasks"
            />
            {draftKeyword.length > 0 ? (
              <Pressable
                onPress={handleClearSearch}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear task search"
                style={({ pressed }) => [
                  styles.clearSearchButton,
                  pressed ? styles.iconButtonPressed : null,
                ]}
              >
                <Icon name="close" size={15} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <AnimatedFilterPressable
            selected={activeChips.length > 0}
            onPress={() => setFilterPanelOpen(true)}
            accessibilityLabel={`Open task filters${activeChips.length > 0 ? `, ${activeChips.length} active` : ""}`}
            accessibilityState={{ expanded: filterPanelOpen }}
            selectionAccessibilityState="none"
            style={styles.filterButton}
            inactiveBackgroundColor={theme.surface}
            selectedBackgroundColor={theme.primarySoft}
            inactiveBorderColor={theme.borderControl}
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
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            distanceAvailable
              ? "Explore open tasks on the approximate nearby map"
              : "Open map availability information"
          }
          onPress={() =>
            router.push({
              pathname: "/map/nearby",
              params: { keyword: appliedKeyword, ...serializeFiltersForRoute(filters) },
            })
          }
          style={({ pressed }) => [styles.mapAction, pressed ? styles.mapActionPressed : null]}
        >
          <View style={styles.mapActionHeader}>
            <Icon name="map-pin" size={18} color={theme.infoOnSoft} />
            <Text
              style={styles.mapActionTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
            >
              {distanceAvailable ? "Explore task map" : "Map unavailable"}
            </Text>
            <Icon name="chevron-right" size={16} color={theme.infoOnSoft} />
          </View>
          {!distanceAvailable ? (
            <Text style={styles.mapActionDescription} numberOfLines={2}>
              No map provider is configured in this environment.
            </Text>
          ) : null}
        </Pressable>

        {hasActiveFilters ? (
          <View style={styles.activeFiltersBlock}>
            <View style={styles.chipSummaryRow} accessibilityRole="text">
              {hasAppliedKeyword ? (
                <StatusBadge tone="neutral" label={`“${appliedKeyword.trim()}”`} />
              ) : null}
              {activeChips.map((chip) => (
                <StatusBadge key={chip} tone="brand" label={chip} />
              ))}
            </View>
            <Button label="Clear all" icon="close" onPress={handleClearAll} variant="text" />
          </View>
        ) : null}
      </View>

      {!isAppActive ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Icon name="alert-circle" size={16} color={theme.warningOnSoft} />
          <Text style={styles.offlineText}>You’re offline. Results may be out of date.</Text>
        </View>
      ) : null}

      {state === "loaded" ? (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {hasActiveFilters ? "Matching tasks" : "Available tasks"}
          </Text>
          <View style={styles.resultsCountBadge}>
            <Text style={styles.resultsCountText}>{total}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      {state === "loading" ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {listHeader}
          <LoadingState label="Loading nearby tasks" />
        </ScrollView>
      ) : null}

      {state === "error" ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {listHeader}
          <ErrorState
            description="Open tasks could not be loaded. Check your connection and try again."
            onRetry={() => load(appliedKeyword, filters, page)}
          />
        </ScrollView>
      ) : null}

      {state === "loaded" && items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {listHeader}
          <EmptyState
            title="No tasks found"
            description={
              hasActiveFilters
                ? "Try a broader search or clear some filters."
                : "There are no open tasks right now. Check back soon."
            }
            {...(hasActiveFilters
              ? { actionLabel: "Clear all filters", onAction: handleClearAll }
              : {})}
          />
        </ScrollView>
      ) : null}

      {state === "loaded" && items.length > 0 ? (
        <FlatList
          ref={listRef}
          data={items}
          extraData={openingTaskId}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              categoryLabel={nameFor(item.categoryId) ?? "Task"}
              opening={openingTaskId === item.id}
              disabled={openingTaskId !== null}
              onOpen={() => void handleOpenTask(item.id)}
            />
          )}
          ListFooterComponent={
            <View style={styles.paginationFooter}>
              <View style={styles.paginationSummaryRow}>
                <Text style={styles.paginationRange} accessibilityLiveRegion="polite">
                  {paginationRangeLabel}
                </Text>
                <Text style={styles.paginationPage}>
                  Page {page} of {totalPages}
                </Text>
              </View>

              {totalPages > 1 ? (
                <View style={styles.paginationButtons}>
                  <PaginationButton
                    direction="previous"
                    label="Previous"
                    disabled={page <= 1}
                    accessibilityHint={`Moves to page ${Math.max(1, page - 1)}`}
                    onPress={() => handlePageChange(page - 1)}
                  />
                  <PaginationButton
                    direction="next"
                    label="Next"
                    primary
                    disabled={!hasMore}
                    accessibilityHint={`Moves to page ${Math.min(totalPages, page + 1)}`}
                    onPress={() => handlePageChange(page + 1)}
                  />
                </View>
              ) : null}
            </View>
          }
        />
      ) : null}

      <TaskFilterPanel
        visible={filterPanelOpen}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setFilterPanelOpen(false)}
      />
    </Screen>
  );
}

function PaginationButton({
  direction,
  label,
  primary = false,
  disabled,
  accessibilityHint,
  onPress,
}: {
  readonly direction: "previous" | "next";
  readonly label: string;
  readonly primary?: boolean;
  readonly disabled: boolean;
  readonly accessibilityHint: string;
  readonly onPress: () => void;
}) {
  const foreground = disabled
    ? theme.disabledForeground
    : primary
      ? theme.onPrimary
      : theme.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} page`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.paginationButton,
        primary ? styles.paginationButtonPrimary : styles.paginationButtonSecondary,
        disabled ? styles.paginationButtonDisabled : null,
        pressed && !disabled ? styles.paginationButtonPressed : null,
      ]}
    >
      {direction === "previous" ? (
        <View style={styles.paginationPreviousIcon}>
          <Icon name="arrow-right" size={16} color={foreground} />
        </View>
      ) : null}
      <Text
        style={[
          styles.paginationButtonText,
          primary ? styles.paginationButtonTextPrimary : null,
          disabled ? styles.paginationButtonTextDisabled : null,
        ]}
      >
        {label}
      </Text>
      {direction === "next" ? <Icon name="arrow-right" size={16} color={foreground} /> : null}
    </Pressable>
  );
}

/** Preserve feed/map parity by carrying every applied filter into the map route. */
function serializeFiltersForRoute(filters: TaskFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (typeof filters.minBudgetCentavos === "number") {
    params.minBudgetCentavos = String(filters.minBudgetCentavos);
  }
  if (typeof filters.maxBudgetCentavos === "number") {
    params.maxBudgetCentavos = String(filters.maxBudgetCentavos);
  }
  if (filters.sameDayOnly) params.sameDayOnly = "1";
  if (filters.scheduledFrom) params.scheduledFrom = filters.scheduledFrom;
  if (filters.scheduledTo) params.scheduledTo = filters.scheduledTo;
  if (filters.cityCode) params.cityCode = filters.cityCode;
  if (filters.barangayCode) params.barangayCode = filters.barangayCode;
  if (filters.sort !== "newest") params.sort = filters.sort;
  return params;
}

function taskTimingLabel(task: PublicTaskFeedItem): string {
  if (task.sameDay) return "Needed today";
  if (!task.scheduledFor) return "Flexible schedule";
  const scheduled = new Date(task.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return "Flexible schedule";
  return scheduled.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function distanceLabel(distanceMeters: number | null): string | null {
  if (distanceMeters === null) return null;
  if (distanceMeters < 1000) return `${Math.max(100, distanceMeters)} m away`;
  const kilometres = distanceMeters / 1000;
  return `${kilometres < 10 ? kilometres.toFixed(1) : kilometres.toFixed(0)} km away`;
}

function TaskCard({
  task,
  categoryLabel,
  opening,
  disabled,
  onOpen,
}: {
  readonly task: PublicTaskFeedItem;
  readonly categoryLabel: string;
  readonly opening: boolean;
  readonly disabled: boolean;
  readonly onOpen: () => void;
}) {
  const distance = distanceLabel(task.distanceMeters);
  const locationLabel = distance ? `${task.landmark} · ${distance}` : task.landmark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, task type ${categoryLabel}, status open for offers, budget ${formatPhp(task.budgetCentavos)}, ${taskTimingLabel(task)}, ${task.landmark}`}
      accessibilityState={{ busy: opening, disabled }}
      disabled={disabled}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.taskCard,
        pressed && !disabled ? styles.taskCardPressed : null,
      ]}
    >
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={styles.cardDescription} numberOfLines={2}>
          {task.description}
        </Text>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.cardDetailRow}>
          <View style={styles.cardDetailIconSlot}>
            <View style={[styles.cardDetailBullet, styles.cardDetailTypeBullet]} />
          </View>
          <Text style={styles.cardDetailText} numberOfLines={2}>
            {categoryLabel}
          </Text>
        </View>
        <View style={styles.cardDetailRow}>
          <View style={styles.cardDetailIconSlot}>
            <View style={[styles.cardDetailBullet, styles.cardDetailStatusBullet]} />
          </View>
          <Text style={[styles.cardDetailText, styles.cardDetailStatusText]}>Open for offers</Text>
        </View>
        <View style={styles.cardDetailRow}>
          <Icon name="calendar" size={15} color={theme.textSecondary} />
          <Text style={styles.cardDetailText}>{taskTimingLabel(task)}</Text>
        </View>
        <View style={styles.cardDetailRow}>
          <Icon name="map-pin" size={15} color={theme.textSecondary} />
          <Text style={styles.cardDetailText} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooter}>
        <Text style={styles.budgetLabel}>BUDGET</Text>
        <View style={styles.cardBottomRow}>
          <Text
            style={styles.cardBudget}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {formatPhp(task.budgetCentavos)}
          </Text>
          <View style={styles.cardActionGroup}>
            <View style={styles.offersBadge}>
              <Icon name="chat" size={13} color={theme.primary} />
              <Text
                style={styles.offersText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {task.offerCount} offer{task.offerCount === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.chevronCircle}>
              {opening ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Icon name="chevron-right" size={15} color={theme.primary} />
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
  },
  controlsCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInputWrapper: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
  },
  searchInputWrapperFocused: {
    backgroundColor: theme.surface,
    borderColor: theme.primary,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: MIN_TOUCH_TARGET,
    paddingVertical: 0,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    position: "relative",
  },
  filterCountBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primary,
    borderWidth: 2,
    borderColor: theme.surface,
  },
  filterCountText: {
    color: theme.onPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  iconButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.92 }],
  },
  mapAction: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.infoSoft,
    borderRadius: radii.md,
  },
  mapActionHeader: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mapActionPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  mapActionTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.infoOnSoft,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "800",
  },
  mapActionDescription: {
    color: theme.infoOnSoft,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  activeFiltersBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  chipSummaryRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  offlineBanner: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  offlineText: {
    color: theme.warningOnSoft,
    fontSize: fontSize.xs,
    fontWeight: "600",
    textAlign: "center",
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultsTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  resultsCountBadge: {
    minWidth: 34,
    height: 30,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primarySoft,
  },
  resultsCountText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  listContent: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  taskCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  taskCardPressed: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.primarySoft,
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  cardDetailIconSlot: {
    width: 15,
    height: 15,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDetailBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardDetailTypeBullet: {
    backgroundColor: theme.primary,
  },
  cardDetailStatusBullet: {
    backgroundColor: theme.successSolid,
  },
  cardDetailStatusText: {
    color: theme.successOnSoft,
    fontWeight: "700",
  },
  cardCopy: {
    gap: spacing.xs,
  },
  cardTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  cardDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  cardDetails: {
    gap: spacing.sm,
  },
  cardDetailRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardDetailText: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  cardDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  cardFooter: {
    minWidth: 0,
    width: "100%",
    gap: 2,
  },
  cardBottomRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  budgetLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  cardBudget: {
    minWidth: 0,
    flex: 1,
    color: theme.primary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  cardActionGroup: {
    minWidth: 0,
    maxWidth: "58%",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  offersBadge: {
    minWidth: 0,
    minHeight: 32,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
  },
  offersText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.primary,
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceSubtle,
  },
  paginationFooter: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  paginationSummaryRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  paginationRange: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  paginationPage: {
    flexShrink: 0,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  paginationButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  paginationButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 130,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  paginationButtonSecondary: {
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  paginationButtonPrimary: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  paginationButtonDisabled: {
    borderColor: theme.disabledBackground,
    backgroundColor: theme.disabledBackground,
  },
  paginationButtonPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  paginationButtonText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  paginationButtonTextPrimary: { color: theme.onPrimary },
  paginationButtonTextDisabled: { color: theme.disabledForeground },
  paginationPreviousIcon: { transform: [{ scaleX: -1 }] },
});
