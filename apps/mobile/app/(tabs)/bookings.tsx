import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { BookingStatus } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Icon } from "../../src/components/ui/Icon";
import {
  DEFAULT_BOOKING_FILTERS,
  activeBookingFilterCount,
  countBookingsByStage,
  describeBookingFilters,
  matchesBookingFilters,
  sortBookings,
  type BookingFilterContext,
  type BookingFilterState,
} from "../../src/components/booking/bookingFilters";
import { BookingFilterPanel } from "../../src/components/booking/BookingFilterPanel";
import { LoadingState, ErrorState, EmptyState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord, ConversationSummary } from "../../src/services/marketplace/types";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  noWebOutline,
  useResponsiveLayout,
} from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

type BookingAction = {
  readonly label: string;
  readonly needsAttention: boolean;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETION_REQUESTED: "Completion requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
};

const STATUS_ACCENT_COLOR: Record<BookingStatus, string> = {
  PAYMENT_PENDING: theme.warningOnSoft,
  PAYMENT_FAILED: theme.errorOnSoft,
  CONFIRMED: theme.infoOnSoft,
  IN_PROGRESS: theme.infoOnSoft,
  COMPLETION_REQUESTED: theme.warningOnSoft,
  COMPLETED: theme.successOnSoft,
  CANCELLED: theme.textSecondary,
  DISPUTED: theme.errorOnSoft,
  REFUNDED: theme.textSecondary,
};

function bookingAction(status: BookingStatus, isClient: boolean): BookingAction {
  switch (status) {
    case "PAYMENT_PENDING":
      return isClient
        ? {
            label: "Complete payment to confirm this booking.",
            needsAttention: true,
          }
        : {
            label: "Waiting for Client payment.",
            needsAttention: false,
          };
    case "PAYMENT_FAILED":
      return isClient
        ? { label: "Retry payment to continue.", needsAttention: true }
        : {
            label: "Client payment needs attention.",
            needsAttention: false,
          };
    case "CONFIRMED":
      return isClient
        ? {
            label: "Chat is open — coordinate the work.",
            needsAttention: false,
          }
        : {
            label: "Start work and coordinate in chat.",
            needsAttention: true,
          };
    case "IN_PROGRESS":
      return isClient
        ? {
            label: "Work is in progress.",
            needsAttention: false,
          }
        : {
            label: "Submit completion when work is done.",
            needsAttention: false,
          };
    case "COMPLETION_REQUESTED":
      return isClient
        ? {
            label: "Review evidence and release funds.",
            needsAttention: true,
          }
        : {
            label: "Waiting for Client confirmation.",
            needsAttention: false,
          };
    case "COMPLETED":
      return {
        label: "Completed and funds released.",
        needsAttention: false,
      };
    case "CANCELLED":
      return {
        label: "This booking was cancelled.",
        needsAttention: false,
      };
    case "DISPUTED":
      return { label: "Track the support review.", needsAttention: false };
    case "REFUNDED":
      return { label: "Payment was refunded.", needsAttention: false };
  }
}

function counterpartFor(booking: BookingRecord, isClient: boolean): string {
  const name = isClient ? booking.taskerDisplayName : booking.clientDisplayName;
  return name.trim() || "Dizkarte user";
}

function bookingUpdatedLabel(updatedAt: string): string {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return "Recently updated";
  return `Updated ${updated.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

/**
 * One line of chat context for a booking row.
 *
 * Returns null when there is nothing truthful to show — no conversation yet
 * (chat unlocks only after payment confirmation) or no message sent. The row
 * then looks exactly as it did before, rather than displaying an empty
 * "Messages" affordance that leads nowhere.
 */
function conversationPreview(
  conversation: ConversationSummary | null,
  viewerId: string,
  counterpartName: string,
): { readonly text: string; readonly time: string } | null {
  if (!conversation || !conversation.lastMessageAt) return null;

  const fromMe = (conversation.lastMessageSenderId as unknown as string) === viewerId;
  const who = fromMe ? "You" : counterpartName.split(" ")[0] || counterpartName;
  const body = conversation.lastMessagePreview?.trim();
  // A media-only message has no body: name the attachment instead of inventing
  // text, and never leak a file name into the list.
  const what = body && body.length > 0 ? body : conversation.lastMessageHasMedia ? "Photo" : "";
  if (!what) return null;

  const sent = new Date(conversation.lastMessageAt);
  const time = Number.isNaN(sent.getTime())
    ? ""
    : sent.toLocaleDateString([], { month: "short", day: "numeric" });

  return { text: `${who}: ${what}`, time };
}

export default function BookingsScreen() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const { isTablet } = useResponsiveLayout();
  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [conversations, setConversations] = useState<ReadonlyMap<string, ConversationSummary>>(
    new Map(),
  );
  const [state, setState] = useState<LoadState>("loading");
  const [filters, setFilters] = useState<BookingFilterState>(DEFAULT_BOOKING_FILTERS);
  const [draftFilters, setDraftFilters] = useState<BookingFilterState>(DEFAULT_BOOKING_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const viewerId = session?.userId;

  const load = useCallback(() => {
    if (!session) return Promise.resolve();
    setState("loading");
    return repository
      .listMyBookings(session.userId)
      .then((result) => {
        setBookings(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  // Conversation activity is a SEPARATE read, deliberately: a booking list must
  // still render if the summary query fails, and a chat preview is never worth
  // blanking the payment/completion actions the user came here for.
  const loadConversations = useCallback(() => {
    if (!session) return Promise.resolve();
    return repository
      .listConversationSummaries(session.userId)
      .then((rows) => {
        setConversations(new Map(rows.map((row) => [row.bookingId as unknown as string, row])));
      })
      .catch(() => undefined);
  }, [repository, session]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations, revision]);

  const handleRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      await Promise.all([
        repository.listMyBookings(session.userId).then((result) => {
          setBookings(result);
          setState("loaded");
        }),
        repository.listConversationSummaries(session.userId).then((rows) => {
          setConversations(new Map(rows.map((row) => [row.bookingId as unknown as string, row])));
        }),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [repository, session]);

  const filterContext = useMemo<BookingFilterContext>(
    () => ({
      viewerId: viewerId ?? "",
      unreadCount: (booking) =>
        conversations.get(booking.id as unknown as string)?.unreadCount ?? 0,
      statusLabel: (status) => STATUS_LABEL[status],
    }),
    [conversations, viewerId],
  );

  // Overview tiles describe the whole list, so they are deliberately measured
  // against the defaults: a tile that moved when a filter changed would stop
  // being an at-a-glance total.
  const overviewCounts = useMemo(
    () => countBookingsByStage(bookings, DEFAULT_BOOKING_FILTERS, filterContext),
    [bookings, filterContext],
  );

  // Sheet badges count against the draft, excluding the stage choice itself.
  const counts = useMemo(
    () => countBookingsByStage(bookings, draftFilters, filterContext, searchQuery),
    [bookings, draftFilters, filterContext, searchQuery],
  );

  const draftMatchingCount = useMemo(
    () =>
      bookings.filter((booking) =>
        matchesBookingFilters(booking, draftFilters, filterContext, searchQuery),
      ).length,
    [bookings, draftFilters, filterContext, searchQuery],
  );

  const activeCount = overviewCounts.active;
  const attentionCount = overviewCounts.attention;
  const activeStatusFilterCount = activeBookingFilterCount(filters);
  const filterChips = useMemo(() => describeBookingFilters(filters), [filters]);

  const applyFilters = useCallback((next: BookingFilterState) => {
    setFilters(next);
    setDraftFilters(next);
    setFilterPanelOpen(false);
  }, []);

  const filtered = useMemo(
    () =>
      sortBookings(
        bookings.filter((booking) =>
          matchesBookingFilters(booking, filters, filterContext, searchQuery),
        ),
        filters.sort,
      ),
    [bookings, filters, filterContext, searchQuery],
  );

  if (!session) {
    return (
      <Screen>
        <View style={styles.container}>
          <AppHeader title="Bookings" />
          <EmptyState title="Sign in" description="Sign in to see your bookings." />
        </View>
      </Screen>
    );
  }

  const clearSearchAndFilters = () => {
    applyFilters(DEFAULT_BOOKING_FILTERS);
    setSearchQuery("");
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={handleRefresh}
      refreshControlTintColor={theme.primary}
    >
      <View style={styles.container}>
        <AppHeader title="Bookings" subtitle="Manage payment, work, completion, and support" />

        {state === "loading" ? <LoadingState label="Loading bookings" /> : null}
        {state === "error" ? (
          <ErrorState
            description="Could not load your bookings. Check your connection and try again."
            onRetry={load}
          />
        ) : null}
        {state === "loaded" && bookings.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Once a task is booked, it appears here with payment, chat, work, and completion updates."
          />
        ) : null}

        {state === "loaded" && bookings.length > 0 ? (
          <>
            <View style={styles.overviewGrid}>
              <View
                style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
                accessible
                accessibilityLabel={`${bookings.length} total booking${bookings.length === 1 ? "" : "s"}`}
              >
                <Text
                  style={styles.overviewValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {bookings.length}
                </Text>
                <Text
                  style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Total bookings
                </Text>
              </View>
              <View
                style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
                accessible
                accessibilityLabel={`${activeCount} active booking${activeCount === 1 ? "" : "s"}`}
              >
                <Text
                  style={styles.overviewValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {activeCount}
                </Text>
                <Text
                  style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Active
                </Text>
              </View>
              <View
                style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
                accessible
                accessibilityLabel={`${attentionCount} booking${attentionCount === 1 ? "" : "s"} needing action`}
              >
                <Text
                  style={styles.overviewValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {attentionCount}
                </Text>
                <Text
                  style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Need action
                </Text>
              </View>
            </View>

            <View style={styles.controlsCard}>
              <View style={styles.controlsHeading}>
                <Text style={styles.controlsTitle}>Find and organise bookings</Text>
              </View>

              <View style={styles.searchFilterRow}>
                <View style={styles.searchBarContainer}>
                  <View style={styles.searchIcon}>
                    <Icon name="search" size={16} color={theme.textSecondary} />
                  </View>
                  <TextInput
                    style={[styles.searchInput, noWebOutline]}
                    placeholder="Search task, participant, or status..."
                    placeholderTextColor={theme.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                    accessibilityLabel="Search bookings"
                  />
                  {searchQuery.length > 0 ? (
                    <Pressable
                      onPress={() => setSearchQuery("")}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Clear booking search"
                      style={({ pressed }) => [
                        styles.clearSearchButton,
                        pressed ? styles.compactPressed : null,
                      ]}
                    >
                      <Icon name="close" size={14} color={theme.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => setFilterPanelOpen(true)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Open booking filters${activeStatusFilterCount > 0 ? ", 1 active" : ""}`}
                  accessibilityState={{ expanded: filterPanelOpen }}
                  style={({ pressed }) => [
                    styles.filterButton,
                    activeStatusFilterCount > 0 ? styles.filterButtonActive : null,
                    pressed ? styles.filterButtonPressed : null,
                  ]}
                >
                  <Icon
                    name="filter"
                    size={19}
                    color={activeStatusFilterCount > 0 ? theme.primary : theme.textSecondary}
                  />
                  {activeStatusFilterCount > 0 ? (
                    <View style={styles.activeFilterCountBadge} pointerEvents="none">
                      <Text style={styles.activeFilterCountText}>{activeStatusFilterCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>

              {activeStatusFilterCount > 0 || searchQuery.trim() ? (
                <View style={styles.activeFiltersBlock}>
                  <Text style={styles.activeFiltersText} numberOfLines={2}>
                    {filterChips.length > 0 ? filterChips.join(" · ") : "All bookings"}
                    {searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ""}
                  </Text>
                  <Pressable
                    onPress={clearSearchAndFilters}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear booking search and filters"
                    style={({ pressed }) => [
                      styles.clearFiltersButton,
                      pressed ? styles.compactPressed : null,
                    ]}
                  >
                    <Text style={styles.clearFiltersText}>Clear</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.resultsSection}>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>Bookings</Text>
                <View
                  style={styles.resultsCountBadge}
                  accessible
                  accessibilityLabel={`${filtered.length} booking${filtered.length === 1 ? "" : "s"} shown`}
                >
                  <Text style={styles.resultsCountText} accessibilityLiveRegion="polite">
                    {filtered.length}
                  </Text>
                </View>
              </View>

              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching bookings"
                  description="Try another search or return to all booking stages."
                  actionLabel="Clear filters"
                  onAction={clearSearchAndFilters}
                />
              ) : (
                <View style={styles.list}>
                  {filtered.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      isClient={booking.clientId === session.userId}
                      conversation={conversations.get(booking.id as unknown as string) ?? null}
                      viewerId={session.userId}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
      </View>

      <BookingFilterPanel
        visible={filterPanelOpen}
        filters={filters}
        counts={counts}
        matchingCount={draftMatchingCount}
        onApply={applyFilters}
        onDraftChange={setDraftFilters}
        onClose={() => {
          setDraftFilters(filters);
          setFilterPanelOpen(false);
        }}
      />
    </Screen>
  );
}

function BookingCard({
  booking,
  isClient,
  conversation,
  viewerId,
}: {
  readonly booking: BookingRecord;
  readonly isClient: boolean;
  readonly conversation: ConversationSummary | null;
  readonly viewerId: string;
}) {
  const counterpart = counterpartFor(booking, isClient);
  const action = bookingAction(booking.status, isClient);
  const viewerRole = isClient ? "Client" : "Tasker";
  const counterpartRole = isClient ? "Tasker" : "Client";
  const statusAccent = STATUS_ACCENT_COLOR[booking.status];
  const preview = conversationPreview(conversation, viewerId, counterpart);
  const unread = conversation?.unreadCount ?? 0;
  const openBooking = () => router.push({ pathname: "/booking/[id]", params: { id: booking.id } });

  return (
    <View style={styles.card}>
      <Pressable
        onPress={openBooking}
        accessibilityRole="button"
        accessibilityLabel={`${booking.taskTitle || "Untitled task"}, ${viewerRole} booking, ${STATUS_LABEL[booking.status]}, ${counterpartRole} ${counterpart}, agreed amount ${formatPhp(booking.agreedCentavos)}, ${action.label}`}
        accessibilityHint="Opens booking details and available actions"
        style={({ pressed }) => [styles.cardMain, pressed ? styles.cardSectionPressed : null]}
      >
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {booking.taskTitle || "Untitled task"}
          </Text>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {action.label}
          </Text>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.cardDetailRow}>
            <Icon name="briefcase" size={15} color={theme.textSecondary} />
            <Text style={styles.cardDetailText}>{viewerRole} booking</Text>
          </View>
          <View style={styles.cardDetailRow}>
            <View style={styles.cardDetailIconSlot}>
              <View style={[styles.cardStatusDot, { backgroundColor: statusAccent }]} />
            </View>
            <Text
              style={[styles.cardDetailText, styles.cardStatusDetailText, { color: statusAccent }]}
            >
              {STATUS_LABEL[booking.status]}
            </Text>
          </View>
          <View style={styles.cardDetailRow}>
            <Icon name="calendar" size={15} color={theme.textSecondary} />
            <Text style={styles.cardDetailText}>{bookingUpdatedLabel(booking.updatedAt)}</Text>
          </View>
          <View style={styles.cardDetailRow}>
            <Icon name="user" size={15} color={theme.textSecondary} />
            <Text style={styles.cardDetailText} numberOfLines={1}>
              {counterpartRole}: {counterpart}
            </Text>
          </View>
        </View>
      </Pressable>

      {preview ? (
        <>
          <Pressable
            onPress={() =>
              router.push({ pathname: "/chat/[bookingId]", params: { bookingId: booking.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0
                ? `Open chat, ${unread} unread ${unread === 1 ? "message" : "messages"}. Latest: ${preview.text}`
                : `Open chat. Latest: ${preview.text}`
            }
            accessibilityHint="Opens the conversation for this booking"
            style={({ pressed }) => [
              styles.chatPreviewBox,
              unread > 0 ? styles.chatPreviewBoxUnread : null,
              pressed ? styles.chatPreviewBoxPressed : null,
            ]}
          >
            <View style={styles.chatPreviewTopRow}>
              <View style={styles.chatPreviewLabelRow}>
                <Icon
                  name="chat"
                  size={13}
                  color={unread > 0 ? theme.primary : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.chatPreviewLabel,
                    unread > 0 ? styles.chatPreviewLabelUnread : null,
                  ]}
                >
                  RECENT CHAT
                </Text>
                {unread > 0 ? (
                  <View style={styles.chatUnreadBadge}>
                    <Text style={styles.chatUnreadBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.chatPreviewMetaRow}>
                {preview.time ? <Text style={styles.chatPreviewTime}>{preview.time}</Text> : null}
              </View>
            </View>

            <Text
              style={[
                styles.chatPreviewMessage,
                unread > 0 ? styles.chatPreviewMessageUnread : null,
              ]}
              numberOfLines={3}
            >
              {preview.text}
            </Text>
          </Pressable>

          <View style={styles.cardDivider} />
        </>
      ) : (
        <View style={styles.cardDivider} />
      )}

      <Pressable
        onPress={openBooking}
        accessibilityRole="button"
        accessibilityLabel="View booking details"
        accessibilityHint="Opens booking details and available actions"
        style={({ pressed }) => [styles.cardBottomRow, pressed ? styles.cardSectionPressed : null]}
      >
        <View style={styles.amountGroup}>
          <Text style={styles.amountLabel}>AGREED AMOUNT</Text>
          <Text
            style={[styles.cardAmount, { fontSize: fontSize.md, lineHeight: lineHeight.md }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {formatPhp(booking.agreedCentavos)}
          </Text>
        </View>
        <View style={styles.viewAction}>
          <Icon name="note" size={13} color={theme.primary} />
          <Text style={styles.viewActionText} numberOfLines={1}>
            Booking
          </Text>
          <Icon name="chevron-right" size={15} color={theme.primary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  overviewGrid: {
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.sm,
  },
  overviewCard: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  overviewCardTablet: {
    paddingHorizontal: spacing.md,
  },
  overviewValue: {
    minWidth: 0,
    color: theme.primary,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  overviewLabel: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  overviewLabelTablet: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  controlsCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  controlsHeading: { gap: spacing.xs },
  controlsTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  searchFilterRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchBarContainer: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    justifyContent: "center",
  },
  searchIcon: {
    position: "absolute",
    left: spacing.md,
    zIndex: 1,
  },
  searchInput: {
    height: 44,
    paddingLeft: spacing.xl + spacing.xs,
    paddingRight: spacing.xl,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
  },
  clearSearchButton: {
    position: "absolute",
    right: spacing.md,
    zIndex: 1,
    padding: 4,
  },
  filterButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  filterButtonActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  filterButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  activeFilterCountBadge: {
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
  activeFilterCountText: {
    color: theme.onPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  activeFiltersBlock: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  activeFiltersText: {
    flex: 1,
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: "600",
  },
  clearFiltersButton: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
  },
  clearFiltersText: {
    color: theme.primary,
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  compactPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  resultsSection: {
    gap: spacing.sm,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultsTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: "800",
  },
  resultsCountBadge: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
  },
  resultsCountText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 310,
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMain: {
    minWidth: 0,
    gap: spacing.md,
  },
  cardSectionPressed: {
    opacity: 0.9,
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
  cardDetailIconSlot: {
    width: 15,
    height: 15,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardStatusDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: 4,
  },
  cardDetailText: {
    minWidth: 0,
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "500",
  },
  cardStatusDetailText: {
    fontWeight: "700",
  },
  cardDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  amountGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  amountLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    // Explicit, tight line heights make the two-line amount group a
    // deterministic height across iOS/Android/Web (no platform-default font
    // box), so `cardBottomRow`'s `alignItems: "center"` lands the "View
    // booking" action on the optical middle between the label and the amount
    // instead of sagging toward the larger amount text.
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  cardAmount: {
    color: theme.primary,
    fontSize: fontSize.lg,
    lineHeight: 22,
    fontWeight: "800",
  },
  viewAction: {
    minHeight: 32,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
  },
  viewActionText: {
    color: theme.primary,
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  chatPreviewBox: {
    gap: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  chatPreviewBoxUnread: {
    backgroundColor: theme.primarySoft,
    // The brand contract has no primary-tinted border token; primary is the
    // emphasis colour already used for unread text on this row.
    borderColor: theme.primary,
  },
  chatPreviewBoxPressed: {
    opacity: 0.75,
  },
  chatPreviewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  chatPreviewLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chatPreviewLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
    textTransform: "uppercase",
  },
  chatPreviewLabelUnread: {
    color: theme.primary,
  },
  chatPreviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  chatPreviewTime: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  chatPreviewMessage: {
    color: theme.textSecondary,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.xs + 3,
    fontWeight: "500",
  },
  chatPreviewMessageUnread: {
    color: theme.textPrimary,
    fontWeight: "700",
  },
  chatUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: radii.pill,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primary,
  },
  chatUnreadBadgeText: {
    color: theme.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
});
