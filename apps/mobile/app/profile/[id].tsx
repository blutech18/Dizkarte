import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { PublicTaskerProfile } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
// One sheet serves "book again" and "request a quote": both post a public task.
import { RebookSheet } from "../../src/components/task/RebookSheet";
import { Button } from "../../src/components/ui/Button";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
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
          {/* Identity hero */}
          <View style={styles.heroCard}>
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
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {profile.displayName}
                </Text>
                {profile.verifiedIdentity ? (
                  <Icon name="check-circle" size={18} color={theme.successSolid} />
                ) : null}
              </View>
              <StatusBadge
                tone={profile.verifiedIdentity ? "success" : "neutral"}
                label={profile.verifiedIdentity ? "ID Verified" : "Not verified"}
              />
              {profile.suspended ? (
                <Text style={styles.suspendedNote}>
                  This Tasker is not currently accepting work.
                </Text>
              ) : null}
            </View>
          </View>

          {/* Trust stats */}
          <View style={styles.statsRow}>
            <Stat
              label="Rating"
              value={profile.ratingAverage === null ? "New" : profile.ratingAverage.toFixed(1)}
              icon="star"
            />
            <View style={styles.statDivider} />
            <Stat label="Reviews" value={String(profile.ratingCount)} icon="chat" />
            <View style={styles.statDivider} />
            <Stat label="Completed" value={String(profile.completionCount)} icon="check-circle" />
          </View>

          {/* About */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            {profile.publicBio.trim().length > 0 ? (
              <Text style={styles.bodyText}>{profile.publicBio.trim()}</Text>
            ) : (
              <Text style={styles.mutedText}>
                This Tasker hasn&apos;t added an introduction yet.
              </Text>
            )}
            {profile.publicExperience.trim().length > 0 ? (
              <>
                <Text style={styles.subheading}>Experience</Text>
                <Text style={styles.bodyText}>{profile.publicExperience.trim()}</Text>
              </>
            ) : null}
          </View>

          {/* Skills */}
          {profile.specialties.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Skills</Text>
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
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Text style={styles.mutedText}>
                {portfolio.length} approved work sample{portfolio.length === 1 ? "" : "s"}.
              </Text>
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
              <Text style={styles.sectionTitle}>Service areas</Text>
              <View style={styles.chipsRow}>
                {areaNames.map((area, index) => (
                  <View key={`${area}-${index}`} style={styles.areaChip}>
                    <Icon name="map-pin" size={13} color={theme.primary} />
                    <Text style={styles.areaChipText}>{area}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Request-a-quote CTA — a quote request is an ordinary public task. */}
          {!isOwnProfile && !profile.suspended ? (
            <View style={styles.ctaCard}>
              <Text style={styles.ctaTitle}>
                Want to work with {profile.displayName.split(/\s+/)[0] || "this Tasker"}?
              </Text>
              <Text style={styles.ctaSubtitle}>Post a task and request a quote.</Text>
              {/*
                Opens the brief-description sheet first, so the quote request
                lands in the posting wizard prefilled - and so the copy can say
                plainly that this posts a PUBLIC task rather than hiring privately.
              */}
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
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
}) {
  return (
    <View style={styles.stat} accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={theme.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surfaceBrand,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarText: {
    color: theme.onPrimary,
    fontSize: fontSize.xxl - 2,
    fontWeight: "800",
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
    flexShrink: 1,
  },
  suspendedNote: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    lineHeight: lineHeight.xs,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.xs,
  },
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  subheading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    marginTop: spacing.xs,
  },
  bodyText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.md,
    color: theme.textPrimary,
  },
  mutedText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  portfolioRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingRight: spacing.md,
  },
  portfolioTile: {
    width: 150,
    gap: spacing.xs,
  },
  portfolioImage: {
    width: 150,
    height: 110,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  portfolioImageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  portfolioCaption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  chip: {
    backgroundColor: theme.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.primaryPressed,
  },
  areaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  areaChipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  ctaCard: {
    backgroundColor: theme.surfaceBrand,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  ctaTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  ctaSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.xs,
  },
});
