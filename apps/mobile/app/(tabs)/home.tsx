import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { PublicTaskerProfile } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { Icon } from "../../src/components/ui/Icon";
import { CategoryGrid } from "../../src/components/task/CategoryGrid";
import { Collapsible } from "../../src/components/ui/Collapsible";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useCategories } from "../../src/providers/CategoriesProvider";
import type { BookingRecord, OwnedTaskRecord } from "../../src/services/marketplace/types";

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
  const { categories } = useCategories();
  const { gutter, contentWidth } = useResponsiveLayout();
  const [tasks, setTasks] = useState<ReadonlyArray<OwnedTaskRecord>>([]);
  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    Promise.all([repository.listMyTasks(session.userId), repository.listMyBookings(session.userId)])
      .then(([taskResult, bookingResult]) => {
        setTasks(taskResult);
        setBookings(bookingResult);
      })
      .catch(() => {});
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

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

  // A handful of real, active categories become the quick-suggestion chips
  // under the search field — never a hardcoded label, since a retired slug
  // would otherwise dead-end into a category the picker no longer offers.
  const suggestedCategories = useMemo(() => categories.slice(0, 4), [categories]);

  // Scale the hero search text to the screen width so the full placeholder
  // always fits on one line: web-sized on wide screens, stepping down on
  // narrower phones instead of wrapping or truncating.
  const searchFontSize =
    contentWidth >= 400 ? fontSize.md : contentWidth >= 344 ? fontSize.sm : fontSize.xs;

  function goToPostFlow() {
    const title = searchDraft.trim();
    router.push(
      title.length > 0 ? { pathname: "/task/create", params: { title } } : "/task/create",
    );
  }

  return (
    <Screen>
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

          {suggestedCategories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -gutter }}
              contentContainerStyle={[clientStyles.suggestionRow, { paddingHorizontal: gutter }]}
            >
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
            </ScrollView>
          ) : null}
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
              ? "Your trusted past professionals — rebook them in one tap."
              : "Taskers you've booked appear here so you can rebook their work in one tap."}
          </Text>
          {myTaskers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -gutter }}
              contentContainerStyle={[
                clientStyles.myTaskersCarouselContent,
                { paddingHorizontal: gutter },
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
    paddingBottom: 48,
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
  suggestionRow: {
    flexDirection: "row",
    gap: spacing.sm,
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
    transform: [{ scale: 0.96 }],
  },
  suggestionChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.onPrimary,
  },
  taskerCountBadge: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
    backgroundColor: theme.primarySoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radii.pill,
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
    width: 275,
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  taskerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  taskerAvatarWrapper: {
    position: "relative",
  },
  taskerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  taskerAvatarText: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.primary,
  },
  ratingBadge: {
    position: "absolute",
    bottom: -4,
    right: -6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  nameAndChevronRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  stackedNameCol: {
    flex: 1,
    gap: 1,
    justifyContent: "center",
  },
  taskerSurname: {
    fontSize: fontSize.xs - 1,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  taskerFirstName: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  chevronBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronBadgeActive: {
    backgroundColor: theme.primarySoft,
  },
  servicesExpandedBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  servicesLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  servicesScrollArea: {
    maxHeight: 110,
  },
  servicesChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingBottom: 2,
  },
  serviceChip: {
    width: "48.2%",
    backgroundColor: theme.primarySoft,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceChipText: {
    fontSize: fontSize.xs - 1,
    fontWeight: "600",
    color: theme.primaryPressed,
    textAlign: "center",
  },
  rebookCarouselButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: theme.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md,
  },
  rebookCarouselText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.onPrimary,
  },
  viewProfileLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  viewProfileLinkText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.primary,
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
    marginBottom: spacing.sm,
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
  quickLinks: { gap: spacing.md },
});

type MyTaskerCardProps = {
  readonly booking: BookingRecord;
};

function MyTaskerCard({ booking }: MyTaskerCardProps) {
  const { repository } = useMarketplace();
  const [expanded, setExpanded] = useState(false);
  const [profile, setProfile] = useState<PublicTaskerProfile | null>(null);

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

  const displayName = (profile?.displayName ?? booking.taskerDisplayName).trim() || "Tasker";
  const ratingLabel =
    profile && profile.ratingAverage !== null ? profile.ratingAverage.toFixed(1) : null;
  const services = profile?.specialties ?? [];
  const hasServices = services.length > 0;
  const subtitle = profile
    ? profile.ratingCount > 0
      ? `${profile.completionCount} job${profile.completionCount === 1 ? "" : "s"} · ${profile.ratingCount} review${profile.ratingCount === 1 ? "" : "s"}`
      : profile.completionCount > 0
        ? `${profile.completionCount} job${profile.completionCount === 1 ? "" : "s"} done`
        : "New tasker"
    : booking.taskTitle;

  function toggleExpanded() {
    if (!hasServices) return;
    setExpanded((current) => !current);
  }

  return (
    <View style={clientStyles.taskerCarouselCard}>
      <Pressable
        style={({ pressed }) => [
          clientStyles.taskerHeaderRow,
          pressed ? { opacity: 0.88, transform: [{ scale: 0.985 }] } : null,
        ]}
        onPress={toggleExpanded}
        disabled={!hasServices}
        accessibilityRole="button"
        accessibilityLabel={
          hasServices
            ? `${displayName}, ${expanded ? "hide services" : "show services"}`
            : displayName
        }
      >
        <View style={clientStyles.taskerAvatarWrapper}>
          <View style={clientStyles.taskerAvatar}>
            <Text style={clientStyles.taskerAvatarText}>
              {(displayName.charAt(0) || "?").toUpperCase()}
            </Text>
          </View>
          {ratingLabel ? (
            <View style={clientStyles.ratingBadge}>
              <Icon name="star" size={10} color="#EAB308" />
              <Text style={clientStyles.ratingText}>{ratingLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={clientStyles.nameAndChevronRow}>
          <View style={clientStyles.stackedNameCol}>
            <Text style={clientStyles.taskerFirstName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={clientStyles.taskerSurname} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {hasServices ? (
            <View
              style={[clientStyles.chevronBadge, expanded ? clientStyles.chevronBadgeActive : null]}
            >
              <Icon
                name={expanded ? "chevron-up" : "chevron-down"}
                size={12}
                color={expanded ? theme.primary : theme.textSecondary}
              />
            </View>
          ) : null}
        </View>
      </Pressable>

      {hasServices ? (
        <Collapsible expanded={expanded} maxHeight={140} style={clientStyles.servicesExpandedBlock}>
          <Text style={clientStyles.servicesLabel}>Services ({services.length})</Text>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={clientStyles.servicesScrollArea}
            contentContainerStyle={clientStyles.servicesChipsRow}
          >
            {services.map((service, sIdx) => (
              <View key={sIdx} style={clientStyles.serviceChip}>
                <Text style={clientStyles.serviceChipText}>{service}</Text>
              </View>
            ))}
          </ScrollView>
        </Collapsible>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          clientStyles.rebookCarouselButton,
          pressed ? { opacity: 0.88, transform: [{ scale: 0.98 }] } : null,
        ]}
        onPress={() =>
          router.push({
            pathname: "/chat/[bookingId]",
            params: { bookingId: booking.id, rebook: "1" },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`Rebook ${displayName}`}
      >
        <Text style={clientStyles.rebookCarouselText}>Rebook</Text>
        <Icon name="arrow-right" size={13} color={theme.onPrimary} />
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: "/profile/[id]", params: { id: booking.taskerId } })}
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName}'s profile`}
        style={({ pressed }) => [clientStyles.viewProfileLink, pressed ? { opacity: 0.7 } : null]}
      >
        <Text style={clientStyles.viewProfileLinkText}>View profile</Text>
      </Pressable>
    </View>
  );
}
