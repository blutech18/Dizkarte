import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { PublicTaskerProfile } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
// One sheet serves "book again" and "request a quote": both post a public task.
import { RebookSheet } from "../../src/components/task/RebookSheet";
import { Button } from "../../src/components/ui/Button";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { ErrorState, LoadingState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { createSignedUrl } from "../../src/services/storage/upload";
import type { PortfolioItemRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, lineHeight, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

/** An approved work sample plus its resolved signed URL. */
type PortfolioTile = PortfolioItemRecord & { readonly url: string | null };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "T";
}

/**
 * Public Tasker profile.
 *
 * Read-only trust view of any Tasker, reached from their offers and from the
 * Client's "My Taskers" list. Everything shown comes from the shared
 * `getPublicTaskerProfile` projection — the same authorized, privacy-safe data
 * already surfaced on offer cards — so this screen never exposes anything a
 * viewer could not already see. The "Request a quote" CTA opens the normal
 * public task-posting flow, because the platform has no private,
 * Tasker-directed booking (a quote request is an ordinary open task).
 */
export default function PublicTaskerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository } = useMarketplace();

  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<PublicTaskerProfile | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [areaNames, setAreaNames] = useState<ReadonlyArray<string>>([]);
  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  /**
   * Approved work samples, each resolved to a short-lived signed URL because the
   * `portfolios` bucket is private. A failure leaves the gallery empty rather
   * than blocking the rest of the profile.
   */
  const [portfolio, setPortfolio] = useState<ReadonlyArray<PortfolioTile>>([]);

  const load = useCallback(() => {
    if (!id) return;
    setState("loading");
    repository
      .getPublicTaskerProfile(id)
      .then((result) => {
        if (!result) {
          setState("error");
          return;
        }
        setProfile(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, id]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve the private avatar object to a short-lived signed URL for display.
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

  // Resolve service-area city codes to their PSGC display names.
  useEffect(() => {
    let active = true;
    const codes = profile?.serviceCityCodes ?? [];
    if (codes.length === 0) {
      setAreaNames([]);
      return;
    }
    void Promise.all(codes.map((code) => repository.getCityByCode(code)))
      .then((cities) => {
        if (!active) return;
        setAreaNames(cities.flatMap((city) => (city ? [city.name] : [])));
      })
      .catch(() => {
        if (active) setAreaNames([]);
      });
    return () => {
      active = false;
    };
  }, [repository, profile?.serviceCityCodes]);

  // Approved work samples, each with a short-lived signed URL for the gallery.
  useEffect(() => {
    let active = true;
    if (!id) {
      setPortfolio([]);
      return;
    }
    void repository
      .listPublicPortfolio(id)
      .then(async (items) =>
        Promise.all(
          items.map(async (item) => ({
            ...item,
            url: await createSignedUrl("portfolios", item.storagePath),
          })),
        ),
      )
      .then((tiles) => {
        if (active) setPortfolio(tiles);
      })
      .catch(() => {
        if (active) setPortfolio([]);
      });
    return () => {
      active = false;
    };
  }, [repository, id]);

  const isOwnProfile = session?.userId === id;

  return (
    <Screen subPageTitle="Tasker profile">
      <Stack.Screen options={{ headerShown: false }} />

      {state === "loading" ? <LoadingState label="Loading profile" /> : null}
      {state === "error" ? (
        <ErrorState
          title="Profile unavailable"
          description="This Tasker profile could not be loaded."
          onRetry={load}
        />
      ) : null}

      {state === "loaded" && profile ? (
        <View style={styles.content}>
          {/* Identity hero & trust card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  accessibilityLabel={`${profile.displayName} profile photo`}
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(profile.displayName)}</Text>
                </View>
              )}
              <View style={styles.heroText}>
                <Text style={styles.name} numberOfLines={2}>
                  {profile.displayName}
                </Text>
                {profile.verifiedIdentity ? (
                  <View style={styles.trustRow}>
                    <Icon name="check-circle" size={14} color={theme.successSolid} />
                    <Text style={styles.trustText}>Verified</Text>
                  </View>
                ) : null}
                {profile.suspended ? (
                  <Text style={styles.suspendedNote}>
                    This Tasker is not currently accepting work.
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.heroDivider} />

            {/* Trust stats row */}
            <View style={styles.statsRow}>
              <Stat
                label="Rating"
                value={profile.ratingAverage === null ? "New" : profile.ratingAverage.toFixed(1)}
                icon="star"
                iconColor="#EAB308"
              />
              <View style={styles.statDivider} />
              <Stat
                label="Reviews"
                value={String(profile.ratingCount)}
                icon="chat"
                iconColor={theme.primary}
              />
              <View style={styles.statDivider} />
              <Stat
                label="Completed"
                value={String(profile.completionCount)}
                icon="check-circle"
                iconColor={theme.successSolid}
              />
            </View>
          </View>

          {/* About */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="user" size={17} color={theme.primary} />
              <Text style={styles.sectionTitle}>About</Text>
            </View>
            {profile.publicBio.trim().length > 0 ? (
              <Text style={styles.bodyText}>{profile.publicBio.trim()}</Text>
            ) : (
              <Text style={styles.mutedText}>
                This Tasker hasn&apos;t added an introduction yet.
              </Text>
            )}
            {profile.publicExperience.trim().length > 0 ? (
              <View style={styles.experienceBlock}>
                <Text style={styles.eyebrow}>EXPERIENCE</Text>
                <Text style={styles.bodyText}>{profile.publicExperience.trim()}</Text>
              </View>
            ) : null}
          </View>

          {/* Skills */}
          {profile.specialties.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="star" size={17} color={theme.primary} />
                <Text style={styles.sectionTitle}>Skills</Text>
              </View>
              <View style={styles.chipsRow}>
                {profile.specialties.map((skill, index) => (
                  <View key={`${skill}-${index}`} style={styles.chip}>
                    <Text style={styles.chipText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Portfolio — approved work samples only. */}
          {portfolio.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeader}>
                  <Icon name="image" size={17} color={theme.primary} />
                  <Text style={styles.sectionTitle}>Portfolio</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {portfolio.length} sample{portfolio.length === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.portfolioRow}
              >
                {portfolio.map((item) => (
                  <View key={item.id} style={styles.portfolioTile}>
                    {item.url ? (
                      <Image
                        source={{ uri: item.url }}
                        style={styles.portfolioImage}
                        resizeMode="cover"
                        accessibilityLabel={item.caption ?? "Work sample"}
                      />
                    ) : (
                      <View style={[styles.portfolioImage, styles.portfolioImageFallback]}>
                        <Icon name="image" size={22} color={theme.textSecondary} />
                      </View>
                    )}
                    {item.caption ? (
                      <Text style={styles.portfolioCaption} numberOfLines={2}>
                        {item.caption}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Service areas */}
          {areaNames.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="map-pin" size={17} color={theme.primary} />
                <Text style={styles.sectionTitle}>Service areas</Text>
              </View>
              <View style={styles.chipsRow}>
                {areaNames.map((area, index) => (
                  <View key={`${area}-${index}`} style={styles.areaChip}>
                    <Icon name="map-pin" size={12} color={theme.primary} />
                    <Text style={styles.areaChipText}>{area}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Request-a-quote CTA — a quote request is an ordinary public task. */}
          {!isOwnProfile && !profile.suspended ? (
            <View style={styles.ctaCard}>
              <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>
                  Work with {profile.displayName.split(/\s+/)[0] || "this Tasker"}
                </Text>
                <Text style={styles.ctaSubtitle}>Post a task and request a quote.</Text>
              </View>
              <Button
                label="Request a quote"
                icon="arrow-right"
                fullWidth
                onPress={() => setQuoteSheetOpen(true)}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {profile && !isOwnProfile ? (
        <RebookSheet
          visible={quoteSheetOpen}
          taskerName={profile.displayName}
          onClose={() => setQuoteSheetOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

function Stat({
  label,
  value,
  icon,
  iconColor,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly iconColor?: string;
}) {
  return (
    <View style={styles.stat} accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statTopRow}>
        <Icon name={icon} size={15} color={iconColor || theme.primary} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.md + 4,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  avatarText: {
    color: theme.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.textPrimary,
    flexShrink: 1,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  trustText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.successOnSoft,
  },
  suspendedNote: {
    fontSize: fontSize.xs,
    color: theme.errorOnSoft,
    lineHeight: lineHeight.xs,
    marginTop: 2,
  },
  heroDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 2,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.borderSubtle,
  },
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.md + 4,
    gap: spacing.sm + 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeaderBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  experienceBlock: {
    gap: 4,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: theme.textSecondary,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.textPrimary,
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderControl,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  areaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderControl,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  areaChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  portfolioRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    paddingTop: 4,
    paddingRight: spacing.md,
  },
  portfolioTile: {
    width: 140,
    gap: 4,
  },
  portfolioImage: {
    width: 140,
    height: 100,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  portfolioImageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  portfolioCaption: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.textSecondary,
  },
  ctaCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  ctaContent: {
    gap: 2,
  },
  ctaTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  ctaSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
  },
});

