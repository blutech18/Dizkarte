import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { PublicTaskerProfile } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { Icon } from "../../src/components/ui/Icon";
import { CategoryGrid } from "../../src/components/task/CategoryGrid";
import { CenterDialogModal } from "../../src/components/ui/CenterDialogModal";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord, OwnedTaskRecord } from "../../src/services/marketplace/types";
import { createSignedUrl } from "../../src/services/storage/upload";

import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  useResponsiveLayout,
  noWebOutline,
} from "../../src/theme";

/**
 * Home is the same for everyone.
 *
 * There is no separate Tasker home or Tasker dashboard: an account signs in as
 * a Client and the same person can also work as a Tasker, so Home stays the
 * action-first "what do you need done?" hub. The Tasker-side surfaces are
 * always-present tabs and screens instead — Browse (find work), Bookings (work
 * as either side), and Earnings & payouts under Profile.
 */
export default function HomeScreen() {
  return <ClientHome />;
}

// ---------------------------------------------------------------------------
// Client landing — action-first hub
// ---------------------------------------------------------------------------

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
  const { gutter, contentWidth } = useResponsiveLayout();
  const [tasks, setTasks] = useState<ReadonlyArray<OwnedTaskRecord>>([]);
  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!session) return Promise.resolve();
    return Promise.all([
      repository.listMyTasks(session.userId),
      repository.listMyBookings(session.userId),
    ])
      .then(([taskResult, bookingResult]) => {
        setTasks(taskResult);
        setBookings(bookingResult);
      })
      .catch(() => {});
  }, [repository, session]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        load(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const firstName = (session?.displayName ?? "").trim().split(/\s+/)[0] || "there";
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
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
   *
   * `listMyBookings` returns every booking the viewer is a party to — as the
   * Client who hired AND as the Tasker who was hired — because one account can
   * be both. Only bookings where the viewer is the *Client* describe a Tasker
   * they hired, so an approved Tasker would otherwise appear in their own
   * "My Taskers" list (their own jobs, keyed by their own `taskerId`). The
   * self-check is a second, explicit guard: you can never rebook yourself.
   */
  const myTaskers = useMemo(() => {
    const viewerId = session?.userId;
    if (!viewerId) return [];
    const eligible = ["CONFIRMED", "IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED"];
    const byTasker = new Map<string, BookingRecord>();
    for (const booking of bookings) {
      if (booking.clientId !== viewerId) continue;
      if (booking.taskerId === viewerId) continue;
      if (!eligible.includes(booking.status)) continue;
      const existing = byTasker.get(booking.taskerId);
      if (!existing || booking.createdAt > existing.createdAt) {
        byTasker.set(booking.taskerId, booking);
      }
    }
    return [...byTasker.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [bookings, session]);

  // Scale the hero search text to the screen width so the full placeholder
  // always fits on one line: web-sized on wide screens, stepping down on
  // narrower phones instead of wrapping or truncating.
  const searchFontSize =
    contentWidth >= 400 ? fontSize.md : contentWidth >= 344 ? fontSize.sm : fontSize.xs;

  const CARD_WIDTH = 270;
  const CARD_GAP = spacing.sm + 2;
  const snapOffsets = useMemo(() => {
    if (myTaskers.length <= 1) return [0];
    const maxScroll = Math.max(
      0,
      gutter * 2 + myTaskers.length * CARD_WIDTH + (myTaskers.length - 1) * CARD_GAP - contentWidth,
    );
    return myTaskers.map((_, i) => {
      if (i === 0) return 0;
      if (i === myTaskers.length - 1) return maxScroll;
      const cardLeft = gutter + i * (CARD_WIDTH + CARD_GAP);
      const centerOffset = cardLeft - (contentWidth - CARD_WIDTH) / 2;
      return Math.max(0, Math.min(maxScroll, Math.round(centerOffset)));
    });
  }, [myTaskers, contentWidth, gutter]);



  function goToPostFlow() {
    const title = searchDraft.trim();
    router.push(
      title.length > 0 ? { pathname: "/task/create", params: { title } } : "/task/create",
    );
  }

  return (
    <Screen
      headerVariant="hero"
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {/*
        One continuous purple sweep — navbar, greeting, and the post-a-task
        hero all share the same brand-purple background and bleed to the
        screen's full width, rounded only at the bottom so it reads as a
        single section instead of a white gap breaking the header from the
        hero card below it.
      */}
      <View
        style={[
          clientStyles.purpleSection,
          { marginHorizontal: -gutter, marginTop: -spacing.lg, paddingHorizontal: gutter },
        ]}
      >
        <AppHeader
          title={`${greeting}, ${firstName}`}
          subtitle="What do you need done today?"
          variant="hero"
        />

        <View style={clientStyles.hero}>
          <Text style={clientStyles.heroTitle}>Find help. Get it sorted.</Text>

          <View
            style={[
              clientStyles.searchInputWrapper,
              isSearchFocused ? clientStyles.searchInputWrapperFocused : null,
            ]}
          >
            <Icon
              name="search"
              size={18}
              color={isSearchFocused ? theme.primary : theme.textSecondary}
            />
            <TextInput
              value={searchDraft}
              onChangeText={setSearchDraft}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onSubmitEditing={goToPostFlow}
              returnKeyType="go"
              placeholder="In a few words, what do you need done?"
              placeholderTextColor={theme.textSecondary}
              spellCheck={false}
              multiline={false}
              numberOfLines={1}
              style={[clientStyles.searchInput, { fontSize: searchFontSize }, noWebOutline]}
              accessibilityLabel="What do you need done?"
            />
          </View>
          <Button
            label="Get offers"
            icon="arrow-right"
            onPress={goToPostFlow}
            variant="primaryDark"
            fullWidth
          />
        </View>
      </View>

      <View style={clientStyles.sectionsStack}>
        {/*
          Real past working relationships only, derived from confirmed-or-later
          bookings. A first-time Client with no history sees an honest nudge to
          post their first task — never fabricated placeholder people.
        */}
        <View>
          <View style={clientStyles.sectionHeaderRow}>
            <Text style={clientStyles.sectionTitle}>My Taskers</Text>
            {myTaskers.length > 0 ? (
              <Text style={clientStyles.taskerCountBadge}>
                {myTaskers.length} tasker{myTaskers.length === 1 ? "" : "s"}
              </Text>
            ) : null}
          </View>
          <Text style={clientStyles.myTaskersSubtitle}>
            {myTaskers.length > 0
              ? "Your trusted past professionals."
              : "Taskers you've booked appear here so you can rebook their work in one tap."}
          </Text>
          {myTaskers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToOffsets={snapOffsets}
              snapToStart={true}
              snapToEnd={true}
              disableIntervalMomentum={true}
              directionalLockEnabled={true}
              nestedScrollEnabled={true}
              scrollEventThrottle={16}
              style={{ marginHorizontal: -gutter }}
              contentContainerStyle={[
                clientStyles.myTaskersCarouselContent,
                {
                  paddingHorizontal: gutter,
                  gap: CARD_GAP,
                },
              ]}
            >
              {myTaskers.map((booking) => (
                <MyTaskerCard key={booking.taskerId} booking={booking} />
              ))}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post a task to book your first Tasker"
              onPress={() => router.push("/task/create")}
              style={({ pressed }) => [
                clientStyles.myTaskersEmptyCard,
                pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null,
              ]}
            >
              <Icon name="user" size={20} color={theme.primary} />
              <Text style={clientStyles.myTaskersEmptyText}>
                No taskers yet — post a task to get offers and build your list.
              </Text>
              <Icon name="arrow-right" size={16} color={theme.primary} />
            </Pressable>
          )}
        </View>

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
            onPress={() => router.push("/(tabs)/my-tasks")}
            style={({ pressed }) => [
              clientStyles.attentionBanner,
              pressed ? { opacity: 0.88, transform: [{ scale: 0.985 }] } : null,
            ]}
          >
            <Icon name="chat" size={18} color={theme.primaryPressed} />
            <Text style={clientStyles.attentionText} numberOfLines={1}>
              {needsAttention} offer{needsAttention === 1 ? "" : "s"} ready to review
            </Text>
            <Icon name="arrow-right" size={16} color={theme.primaryPressed} />
          </Pressable>
        ) : null}

        <View style={clientStyles.quickLinks}>
          <Button
            label="Help & support"
            icon="chat"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/support")}
          />
        </View>
      </View>
    </Screen>
  );
}

const clientStyles = StyleSheet.create({
  // Bleeds past the Screen's own side padding so the purple section spans the
  // full device width, edge to edge, with rounded corners only at the bottom
  // where it meets the white page background.
  purpleSection: {
    backgroundColor: theme.primary,
    marginBottom: spacing.xl,
    paddingTop: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    position: "relative",
  },
  // Every top-level section below the hero shares one consistent vertical
  // rhythm instead of each section owning its own ad hoc margin — this is
  // what keeps the gap between "My Taskers", the category grid, the offers
  // banner, and "Your active tasks" uniform on any screen size.
  sectionsStack: {
    gap: spacing.xl,
  },
  hero: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
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
    borderWidth: 2,
    borderColor: "transparent",
  },
  searchInputWrapperFocused: {
    borderColor: theme.onPrimary,
  },
  searchInput: {
    flex: 1,
    height: MIN_TOUCH_TARGET,
    paddingVertical: 0,
    color: theme.textPrimary,
  },
  myTaskersSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  myTaskersCarouselContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  myTaskersEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  myTaskersEmptyText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  taskerCarouselCard: {
    width: 270,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md - 2,
    gap: spacing.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  taskerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    width: "100%",
  },
  taskerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  taskerAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  taskerAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.primary,
  },
  taskerInfoCol: {
    flex: 1,
    gap: 1,
    justifyContent: "center",
  },
  taskerNameRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  taskerNameGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskerDisplayName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textPrimary,
    letterSpacing: -0.2,
  },
  taskerRatingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  taskerRatingScore: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  taskerMetaText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: "500",
    marginTop: 2,
  },
  taskerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    width: "100%",
  },
  specialtiesRowButton: {
    flex: 1,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(92, 56, 222, 0.16)",
    borderRadius: 8,
  },
  specialtiesRowButtonPressed: {
    backgroundColor: "rgba(92, 56, 222, 0.24)",
    borderColor: theme.primary,
  },
  specialtiesRowButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
  },
  rebookRowButton: {
    flex: 1,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: theme.primary,
    borderRadius: 8,
  },
  rebookRowButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  rebookRowButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.onPrimary,
  },
  // Modal styles
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  modalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  modalAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  modalAvatarText: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.primary,
  },
  modalHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.2,
  },
  modalStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  modalRatingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  modalRatingScore: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  modalRatingCount: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: theme.textSecondary,
  },
  modalDotSeparator: {
    fontSize: fontSize.xs,
    color: theme.borderSubtle,
    marginHorizontal: 1,
  },
  modalJobsCount: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: theme.textSecondary,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  modalServicesList: {
    maxHeight: 240,
  },
  modalServicesListContent: {
    gap: spacing.xs + 2,
    paddingVertical: 2,
  },
  modalEmptyServices: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalEmptyServicesText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
  },
  modalServiceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  modalServiceName: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    flex: 1,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  modalViewProfileBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  modalViewProfileBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.primary,
  },
  modalRebookBtn: {
    flex: 1.1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: theme.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  modalRebookBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.onPrimary,
  },
  attentionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
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
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.3,
  },
  taskerCountBadge: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    backgroundColor: theme.surfaceSubtle,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  quickLinks: {
    gap: spacing.sm,
  },
});

function formatSpecialty(text: string): string {
  return text
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

type MyTaskerCardProps = {
  readonly booking: BookingRecord;
};

function MyTaskerCard({ booking }: MyTaskerCardProps) {
  const { repository } = useMarketplace();
  const [profile, setProfile] = useState<PublicTaskerProfile | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [servicesModalVisible, setServicesModalVisible] = useState(false);

  useEffect(() => {
    let active = true;
    repository
      .getPublicTaskerProfile(booking.taskerId)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [repository, booking.taskerId]);

  useEffect(() => {
    let active = true;
    const path = profile?.avatarPath ?? null;
    if (!path) {
      setAvatarUri(null);
      return;
    }
    void createSignedUrl("avatars", path).then((url) => {
      if (active) setAvatarUri(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatarPath]);

  const displayName = (profile?.displayName ?? booking.taskerDisplayName).trim() || "Tasker";
  const ratingLabel =
    profile && profile.ratingAverage !== null ? profile.ratingAverage.toFixed(1) : null;
  const ratingCount = profile?.ratingCount ?? 0;
  const completionCount = profile?.completionCount ?? 0;
  const services = profile?.specialties ?? [];

  const openProfile = useCallback(() => {
    router.push({ pathname: "/profile/[id]", params: { id: booking.taskerId } });
  }, [booking.taskerId]);

  return (
    <>
      <View style={clientStyles.taskerCarouselCard}>
        {/* Top Horizontal Row: Avatar on Left + Info on Right */}
        <View style={clientStyles.taskerTopRow}>
          <Pressable
            style={({ pressed }) => [
              clientStyles.taskerAvatar,
              pressed ? { opacity: 0.8 } : null,
            ]}
            onPress={openProfile}
            accessibilityRole="button"
            accessibilityLabel={`View ${displayName}'s profile`}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={clientStyles.taskerAvatarImage} />
            ) : (
              <Text style={clientStyles.taskerAvatarText}>
                {(displayName.charAt(0) || "?").toUpperCase()}
              </Text>
            )}
          </Pressable>

          <View style={clientStyles.taskerInfoCol}>
            <View style={clientStyles.taskerNameRatingRow}>
              <Pressable
                style={({ pressed }) => [
                  clientStyles.taskerNameGroup,
                  pressed ? { opacity: 0.7 } : null,
                ]}
                onPress={openProfile}
                accessibilityRole="button"
                accessibilityLabel={`View ${displayName}'s profile`}
              >
                <Text style={clientStyles.taskerDisplayName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Icon name="eye" size={15} color={theme.primary} />
              </Pressable>

              {ratingLabel ? (
                <View style={clientStyles.taskerRatingInline}>
                  <Icon name="star" size={11} color="#EAB308" />
                  <Text style={clientStyles.taskerRatingScore}>{ratingLabel}</Text>
                </View>
              ) : null}
            </View>

            <Text style={clientStyles.taskerMetaText} numberOfLines={1}>
              {completionCount > 0
                ? `${completionCount} task${completionCount === 1 ? "" : "s"} completed`
                : `${services.length} ${services.length === 1 ? "specialty" : "specialties"} available`}
            </Text>
          </View>
        </View>

        {/* Action Row: Specialties + Rebook */}
        <View style={clientStyles.taskerActionsRow}>
          <Pressable
            onPress={() => setServicesModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`View services offered by ${displayName}`}
            style={({ pressed }) => [
              clientStyles.specialtiesRowButton,
              pressed ? clientStyles.specialtiesRowButtonPressed : null,
            ]}
          >
            <Text style={clientStyles.specialtiesRowButtonText} numberOfLines={1}>
              {services.length > 0
                ? `${services.length === 1 ? "Specialty" : "Specialties"} (${services.length})`
                : "Specialties"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/chat/[bookingId]",
                params: { bookingId: booking.id, rebook: "1" },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Rebook ${displayName}`}
            style={({ pressed }) => [
              clientStyles.rebookRowButton,
              pressed ? clientStyles.rebookRowButtonPressed : null,
            ]}
          >
            <Text style={clientStyles.rebookRowButtonText}>Rebook</Text>
            <Icon name="arrow-right" size={11} color={theme.onPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Services List Modal */}
      <CenterDialogModal
        visible={servicesModalVisible}
        onClose={() => setServicesModalVisible(false)}
      >
        <View style={clientStyles.modalCard}>
          <View style={clientStyles.modalHeader}>
            <View style={clientStyles.modalAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={clientStyles.modalAvatarImage} />
              ) : (
                <Text style={clientStyles.modalAvatarText}>
                  {(displayName.charAt(0) || "?").toUpperCase()}
                </Text>
              )}
            </View>
            <View style={clientStyles.modalHeaderInfo}>
              <Text style={clientStyles.modalTitle}>{displayName}</Text>
              <View style={clientStyles.modalStatsRow}>
                {ratingLabel ? (
                  <View style={clientStyles.modalRatingInline}>
                    <Icon name="star" size={11} color="#EAB308" />
                    <Text style={clientStyles.modalRatingScore}>{ratingLabel}</Text>
                    {ratingCount > 0 ? (
                      <Text style={clientStyles.modalRatingCount}>({ratingCount})</Text>
                    ) : null}
                    <Text style={clientStyles.modalDotSeparator}>·</Text>
                  </View>
                ) : null}
                <Text style={clientStyles.modalJobsCount}>
                  {completionCount > 0
                    ? `${completionCount} job${completionCount === 1 ? "" : "s"} completed`
                    : "Verified Tasker"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setServicesModalVisible(false)}
              style={({ pressed }) => [
                clientStyles.modalCloseButton,
                pressed ? { opacity: 0.7 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close services dialog"
            >
              <Icon name="close" size={15} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={clientStyles.modalServicesList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={clientStyles.modalServicesListContent}
          >
            {services.length > 0 ? (
              services.map((service, idx) => (
                <View key={idx} style={clientStyles.modalServiceItem}>
                  <Icon name="check-circle" size={18} color={theme.primary} />
                  <Text style={clientStyles.modalServiceName}>{formatSpecialty(service)}</Text>
                </View>
              ))
            ) : (
              <View style={clientStyles.modalEmptyServices}>
                <Text style={clientStyles.modalEmptyServicesText}>
                  No specific specialties listed yet.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={clientStyles.modalFooter}>
            <Pressable
              style={({ pressed }) => [
                clientStyles.modalViewProfileBtn,
                pressed ? { opacity: 0.85, transform: [{ scale: 0.985 }] } : null,
              ]}
              onPress={() => {
                setServicesModalVisible(false);
                openProfile();
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${displayName}'s profile`}
            >
              <Icon name="user" size={15} color={theme.primary} />
              <Text style={clientStyles.modalViewProfileBtnText}>View profile</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                clientStyles.modalRebookBtn,
                pressed ? { opacity: 0.88, transform: [{ scale: 0.985 }] } : null,
              ]}
              onPress={() => {
                setServicesModalVisible(false);
                router.push({
                  pathname: "/chat/[bookingId]",
                  params: { bookingId: booking.id, rebook: "1" },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Rebook ${displayName}`}
            >
              <Text style={clientStyles.modalRebookBtnText}>Rebook</Text>
              <Icon name="arrow-right" size={11} color={theme.onPrimary} />
            </Pressable>
          </View>
        </View>
      </CenterDialogModal>
    </>
  );
}

