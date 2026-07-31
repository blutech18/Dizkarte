import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { PublicTaskFeedItem } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { LoadingState, EmptyState, ErrorState } from "../../src/components/ui/AsyncState";
import { StatusBadge, type BadgeTone } from "../../src/components/ui/StatusBadge";
import { Icon } from "../../src/components/ui/Icon";
import {
  TaskFilterPanel,
  DEFAULT_TASK_FILTERS,
  useActiveFilterChips,
  buildTaskSearchQuery,
  type TaskFilterState,
} from "../../src/components/task/TaskFilterPanel";
import { CategoryGrid } from "../../src/components/task/CategoryGrid";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useConnectivity } from "../../src/providers/ConnectivityProvider";
import { useCategories } from "../../src/providers/CategoriesProvider";
import { isApprovedTasker } from "../../src/services/session-types";
import { getMapProvider } from "../../src/services/map/factory";
import type { BookingRecord, OwnedTaskRecord } from "../../src/services/marketplace/types";
import type { TaskStatus } from "@dizkarte/domain";
import { theme, spacing, fontSize, lineHeight, radii, MIN_TOUCH_TARGET } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

const PAGE_SIZE = 20;

/**
 * Home is role-adaptive:
 *  - An approved Tasker sees the discovery feed ("Browse work") — a scannable
 *    list is the right shape for browsing tasks to offer on.
 *  - Everyone else (a Client) sees an action-first landing focused on posting
 *    a task and glancing at their own active tasks — deliberately NOT another
 *    task-card feed, so the Client and Tasker home screens read differently.
 */
export default function HomeScreen() {
  const { session } = useSession();
  if (isApprovedTasker(session)) {
    return <TaskerDiscoveryFeed />;
  }
  return <ClientHome />;
}

// ---------------------------------------------------------------------------
// Client landing — action-first hub
// ---------------------------------------------------------------------------

const CLIENT_ACTIVE_STATUSES: ReadonlyArray<TaskStatus> = [
  "OPEN",
  "BOOKING_PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
];

const CLIENT_STATUS_TONE: Partial<Record<TaskStatus, BadgeTone>> = {
  DRAFT: "neutral",
  OPEN: "brand",
  BOOKING_PENDING: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETION_REQUESTED: "warning",
};

const CLIENT_STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  DRAFT: "Draft",
  OPEN: "Open for offers",
  BOOKING_PENDING: "Payment pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETION_REQUESTED: "Completion requested",
};

/** Time-of-day greeting, matching the Airtasker home reference (Good morning/afternoon/evening/night). */
function greetingForHour(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

function ClientHome() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const { categories } = useCategories();
  const [tasks, setTasks] = useState<ReadonlyArray<OwnedTaskRecord>>([]);
  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [searchDraft, setSearchDraft] = useState("");

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    Promise.all([repository.listMyTasks(session.userId), repository.listMyBookings(session.userId)])
      .then(([taskResult, bookingResult]) => {
        setTasks(taskResult);
        setBookings(bookingResult);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

  const firstName = (session?.displayName ?? "").trim().split(/\s+/)[0] || "there";
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const activeTasks = useMemo(
    () => tasks.filter((t) => CLIENT_ACTIVE_STATUSES.includes(t.status)).slice(0, 3),
    [tasks],
  );
  const needsAttention = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.status === "OPEN" ? t.offerCount : 0), 0),
    [tasks],
  );

  /**
   * Taskers this Client has actually booked before, most recent first.
   *
   * Built from `listMyBookings` rather than a stored "favourites" concept —
   * there isn't one — so every card is a real past working relationship, never
   * placeholder people. One card per Tasker (their most recent booking), and
   * only for a booking that reached a real working relationship (confirmed or
   * later), so a same-day cancellation never shows up as someone to rebook.
   */
  const myTaskers = useMemo(() => {
    const eligible = ["CONFIRMED", "IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED"];
    const byTasker = new Map<string, BookingRecord>();
    for (const booking of bookings) {
      if (!eligible.includes(booking.status)) continue;
      const existing = byTasker.get(booking.taskerId);
      if (!existing || booking.createdAt > existing.createdAt) {
        byTasker.set(booking.taskerId, booking);
      }
    }
    return [...byTasker.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [bookings]);

  // A handful of real, active categories become the quick-suggestion chips
  // under the search field — never a hardcoded label, since a retired slug
  // would otherwise dead-end into a category the picker no longer offers.
  const suggestedCategories = useMemo(() => categories.slice(0, 4), [categories]);

  function goToPostFlow() {
    const title = searchDraft.trim();
    router.push(title.length > 0 ? { pathname: "/task/create", params: { title } } : "/task/create");
  }

  return (
    <Screen>
      {/*
        Full-bleed brand hero: greeting, headline, search-to-post, and quick
        category chips. Bleeds past the Screen's own padding the same way
        AppHeader's top navbar does (negative margin matching that padding),
        so this is the established full-bleed technique, not a new one.
      */}
      <View style={clientStyles.hero}>
        <View style={clientStyles.heroTopRow}>
          <Text style={clientStyles.heroGreeting}>
            {greeting}, {firstName}
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/notifications")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
          >
            <Icon name="bell" size={22} color={theme.onPrimary} />
          </Pressable>
        </View>
        <Text style={clientStyles.heroTitle}>Post a Task.{"\n"}Get it Done.</Text>

        <View style={clientStyles.searchInputWrapper}>
          <Icon name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            onSubmitEditing={goToPostFlow}
            returnKeyType="go"
            placeholder="In a few words, what do you need done?"
            placeholderTextColor={theme.textSecondary}
            style={clientStyles.searchInput}
            accessibilityLabel="What do you need done?"
          />
        </View>
        <Button label="Get offers" icon="arrow-right" onPress={goToPostFlow} fullWidth />

        {suggestedCategories.length > 0 ? (
          <View style={clientStyles.suggestionRow}>
            {suggestedCategories.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityLabel={`Post a ${category.name} task`}
                onPress={() =>
                  router.push({ pathname: "/task/create", params: { category: category.id } })
                }
                style={({ pressed }) => [
                  clientStyles.suggestionChip,
                  pressed ? clientStyles.suggestionChipPressed : null,
                ]}
              >
                <Text style={clientStyles.suggestionChipText}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {myTaskers.length > 0 ? (
        <View style={clientStyles.myTaskersSection}>
          <Text style={clientStyles.sectionTitle}>My Taskers</Text>
          <Text style={clientStyles.myTaskersSubtitle}>
            Your past Taskers, all in one place. Rebook anytime.
          </Text>
          <View style={clientStyles.myTaskersList}>
            {myTaskers.slice(0, 6).map((booking) => (
              <View key={booking.taskerId} style={clientStyles.taskerCard}>
                <View style={clientStyles.taskerAvatar}>
                  <Text style={clientStyles.taskerAvatarText}>
                    {(booking.taskerDisplayName.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                </View>
                <View style={clientStyles.taskerInfo}>
                  <Text style={clientStyles.taskerName} numberOfLines={1}>
                    {booking.taskerDisplayName}
                  </Text>
                  <Text style={clientStyles.taskerMeta} numberOfLines={1}>
                    {booking.taskTitle}
                  </Text>
                </View>
                <Button
                  label="Rebook"
                  variant="secondary"
                  onPress={() => router.push("/task/create")}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/*
        Category shortcuts into the same posting flow. Starting from "what do I
        need done" is a shorter path than opening an empty form and hunting for
        the category, so the tile carries the choice through.
      */}
      <CategoryGrid limit={8} />

      {needsAttention > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`You have ${needsAttention} new offers to review`}
          onPress={() => router.push("/(tabs)/work")}
          style={clientStyles.attentionBanner}
        >
          <Icon name="chat" size={18} color={theme.primaryPressed} />
          <Text style={clientStyles.attentionText}>
            {needsAttention} offer{needsAttention === 1 ? "" : "s"} waiting on your open task
            {needsAttention === 1 ? "" : "s"} — review and choose a Tasker
          </Text>
          <Icon name="arrow-right" size={16} color={theme.primaryPressed} />
        </Pressable>
      ) : null}

      <View style={clientStyles.sectionHeaderRow}>
        <Text style={clientStyles.sectionTitle}>Your active tasks</Text>
        <Button label="See all" onPress={() => router.push("/(tabs)/work")} variant="text" />
      </View>

      {state === "loading" ? <LoadingState label="Loading your tasks" /> : null}
      {state === "error" ? <ErrorState onRetry={load} /> : null}
      {state === "loaded" && activeTasks.length === 0 ? (
        <EmptyState
          title="No active tasks"
          description="When you post a task, it will appear here with its status and offers."
        />
      ) : null}
      {state === "loaded" && activeTasks.length > 0 ? (
        <View style={clientStyles.taskList}>
          {activeTasks.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              accessibilityLabel={`${task.draft.title || "Untitled task"}, ${
                CLIENT_STATUS_LABEL[task.status] ?? task.status
              }`}
              onPress={() =>
                task.status === "DRAFT"
                  ? router.push({ pathname: "/task/[id]/preview", params: { id: task.id } })
                  : router.push({ pathname: "/task/[id]/owned", params: { id: task.id } })
              }
              style={({ pressed }) => [
                clientStyles.taskRow,
                pressed ? clientStyles.taskRowPressed : null,
              ]}
            >
              <View style={clientStyles.taskRowMain}>
                <Text style={clientStyles.taskRowTitle} numberOfLines={1}>
                  {task.draft.title || "Untitled task"}
                </Text>
                <Text style={clientStyles.taskRowMeta}>
                  {formatPhp(task.draft.budgetCentavos || 0)} · {task.offerCount} offer
                  {task.offerCount === 1 ? "" : "s"}
                </Text>
              </View>
              <StatusBadge
                tone={CLIENT_STATUS_TONE[task.status] ?? "neutral"}
                label={CLIENT_STATUS_LABEL[task.status] ?? task.status}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={clientStyles.quickLinks}>
        <Button
          label="My bookings"
          icon="calendar"
          variant="secondary"
          fullWidth
          onPress={() => router.push("/(tabs)/bookings")}
        />
        <Button
          label="Help & support"
          icon="chat"
          variant="secondary"
          fullWidth
          onPress={() => router.push("/support")}
        />
      </View>
    </Screen>
  );
}

const clientStyles = StyleSheet.create({
  hero: {
    backgroundColor: theme.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    gap: spacing.md,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.xl,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroGreeting: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.onPrimary,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: "800",
    color: theme.onPrimary,
    letterSpacing: -0.4,
  },
  searchInputWrapper: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    fontSize: fontSize.md,
    color: theme.textPrimary,
  },
  suggestionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  suggestionChip: {
    minHeight: MIN_TOUCH_TARGET - 8,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.onPrimary,
  },
  suggestionChipPressed: {
    backgroundColor: theme.primaryPressed,
  },
  suggestionChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.onPrimary,
  },
  myTaskersSection: {
    marginBottom: spacing.xl,
  },
  myTaskersSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  myTaskersList: {
    gap: spacing.sm,
  },
  taskerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  taskerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  taskerAvatarText: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.primaryPressed,
  },
  taskerInfo: { flex: 1, gap: spacing.xs },
  taskerName: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  taskerMeta: { fontSize: fontSize.sm, color: theme.textSecondary },
  attentionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  attentionText: {
    flex: 1,
    color: theme.primaryPressed,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "700", color: theme.textPrimary },
  taskList: { gap: spacing.md, marginTop: spacing.sm },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  taskRowPressed: { backgroundColor: theme.surfaceSubtle },
  taskRowMain: { flex: 1, gap: spacing.xs },
  taskRowTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  taskRowMeta: { fontSize: fontSize.sm, color: theme.textSecondary },
  quickLinks: { gap: spacing.md, marginTop: spacing.xl },
});

// ---------------------------------------------------------------------------
// Tasker discovery feed — "Browse work"
// ---------------------------------------------------------------------------

function TaskerDiscoveryFeed() {
  const { retryTick, isAppActive } = useConnectivity();
  const { repository } = useMarketplace();
  // Draft keyword mirrors every keystroke in the search box; applied keyword
  // is only updated on explicit submit (search "Enter"/Clear all) and is the
  // one actually used to fetch. This is what makes the fetch effect's
  // dependency list honest: typing alone never triggers a network request.
  const [draftKeyword, setDraftKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_TASK_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicTaskFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<LoadState>("loading");

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
    load(appliedKeyword, filters, page);
    // Reloads on retry tick, applied keyword (only changes on submit), filter
    // change, or page change — never on a draft keystroke, since
    // `draftKeyword` is intentionally not in this dependency list.
  }, [load, retryTick, appliedKeyword, filters, page]);

  const activeChips = useActiveFilterChips(filters);

  function handleSearchSubmit() {
    setAppliedKeyword(draftKeyword);
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

  const hasActiveFilters = activeChips.length > 0 || appliedKeyword.trim().length > 0;

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <AppHeader title="Browse work" subtitle="Find tasks to offer on" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open approximate nearby map"
          onPress={() =>
            router.push({
              pathname: "/map/nearby",
              params: { keyword: appliedKeyword, ...serializeFiltersForRoute(filters) },
            })
          }
          style={styles.mapNotice}
        >
          <Text style={styles.mapNoticeText}>
            {distanceAvailable
              ? "View an approximate schematic map of these results"
              : "Map view is unavailable — no map provider is configured in this environment."}
          </Text>
          {distanceAvailable ? (
            <Icon name="arrow-right" size={16} color={theme.infoOnSoft} />
          ) : null}
        </Pressable>
        <TextField
          label="Search tasks"
          value={draftKeyword}
          onChangeText={setDraftKeyword}
          onSubmitEditing={handleSearchSubmit}
          placeholder="e.g. cleaning, plumbing, delivery"
          returnKeyType="search"
        />
        <View style={styles.filterBarRow}>
          <Button
            label="Filters & sort"
            icon="filter"
            onPress={() => setFilterPanelOpen(true)}
            variant="secondary"
          />
          {hasActiveFilters ? (
            <Button label="Clear all" icon="close" onPress={handleClearAll} variant="text" />
          ) : null}
        </View>
        {hasActiveFilters ? (
          <View style={styles.chipSummaryRow} accessibilityRole="text">
            {appliedKeyword.trim() ? (
              <StatusBadge tone="neutral" label={`"${appliedKeyword.trim()}"`} />
            ) : null}
            {activeChips.map((chip) => (
              <StatusBadge key={chip} tone="brand" label={chip} />
            ))}
          </View>
        ) : null}
      </View>
      {!isAppActive ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>You appear to be offline. Results may be stale.</Text>
        </View>
      ) : null}
      {state === "loading" ? <LoadingState label="Loading nearby tasks" /> : null}
      {state === "error" ? <ErrorState onRetry={() => load(appliedKeyword, filters, page)} /> : null}
      {state === "loaded" && items.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description={
            hasActiveFilters
              ? "Try widening your filters or clearing them."
              : "Check back soon for new tasks."
          }
          {...(hasActiveFilters
            ? { actionLabel: "Clear all filters", onAction: handleClearAll }
            : {})}
        />
      ) : null}
      {state === "loaded" && items.length > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <TaskCard task={item} />}
          ListFooterComponent={
            <View style={styles.paginationRow}>
              <Text style={styles.paginationLabel}>
                {items.length} of {total} task{total === 1 ? "" : "s"}
              </Text>
              <View style={styles.paginationButtons}>
                <Button
                  label="Previous"
                  variant="secondary"
                  disabled={page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                />
                <Button
                  label="Next"
                  variant="secondary"
                  disabled={!hasMore}
                  onPress={() => setPage((p) => p + 1)}
                />
              </View>
            </View>
          }
        />
      ) : null}
      <TaskFilterPanel
        visible={filterPanelOpen}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setFilterPanelOpen(false)}
        distanceAvailable={distanceAvailable}
      />
    </Screen>
  );
}

/**
 * Serializes every applied filter field into route params for `/map/nearby`
 * so the map screen can reconstruct the exact same `TaskFilterState` (and
 * therefore issue the exact same `buildTaskSearchQuery` call) that produced
 * the current feed — this is what the feed/map parity guarantee depends on.
 */
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
  if (filters.areaId) params.areaId = filters.areaId;
  if (typeof filters.radiusKm === "number") params.radiusKm = String(filters.radiusKm);
  if (filters.sort !== "newest") params.sort = filters.sort;
  return params;
}

function TaskCard({ task }: { readonly task: PublicTaskFeedItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, budget ${formatPhp(task.budgetCentavos)}, ${task.landmark}`}
      onPress={() => router.push(`/task/${task.id}`)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{task.title}</Text>
        {task.sameDay ? <StatusBadge tone="warning" label="Same-day" /> : null}
      </View>
      <Text style={styles.cardDescription} numberOfLines={2}>
        {task.description}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardBudget}>{formatPhp(task.budgetCentavos)}</Text>
        <Text style={styles.cardLocation}>{task.landmark}</Text>
      </View>
      <Text style={styles.cardOffers}>
        {task.offerCount} offer{task.offerCount === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.sm,
  },
  mapNotice: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: theme.infoSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  mapNoticeText: {
    flex: 1,
    color: theme.infoOnSoft,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  filterBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  offlineBanner: {
    backgroundColor: theme.warningSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  offlineText: { color: theme.warningOnSoft, fontSize: fontSize.xs, textAlign: "center" },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    // The list applies `gap`; a marginBottom on top of it double-spaced the feed.
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
    flex: 1,
  },
  cardDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.sm,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  cardBudget: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  cardLocation: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  cardOffers: {
    fontSize: fontSize.xs,
    color: theme.primary,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  paginationRow: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    alignItems: "center",
  },
  paginationLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
  paginationButtons: { flexDirection: "row", gap: spacing.sm },
});
