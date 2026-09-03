import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
} from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { TextField } from "../src/components/ui/TextField";
import { Button } from "../src/components/ui/Button";
import { Icon, type IconName } from "../src/components/ui/Icon";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { ProfilePageIntro, ProfilePageSection } from "../src/components/profile/ProfilePageSection";
import { LocalityPicker } from "../src/components/task/LocalityPicker";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import { ScreenScrollProvider } from "../src/providers/ScreenScrollContext";
import type { SpecialtyOption, TaskerApplicationRecord } from "../src/services/marketplace";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../src/theme";

const PAYOUT_PROVIDERS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
  readonly mark: "gcash" | "maya" | "bank";
}> = [
  { value: "gcash", label: "GCash", mark: "gcash" },
  { value: "maya", label: "Maya", mark: "maya" },
  { value: "bank", label: "Bank transfer", mark: "bank" },
];

const REVIEW_STATUSES = new Set<TaskerApplicationRecord["status"]>(["SUBMITTED", "IN_REVIEW"]);

export default function TaskerApplicationScreen() {
  const { session, status: sessionStatus } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { gutter, isTablet } = useResponsiveLayout();
  const userId = session?.userId ?? null;
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardHeightRef = useRef(0);
  const footerOpacity = useRef(new Animated.Value(1)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardVisible(true);
      keyboardHeightRef.current = e?.endCoordinates?.height ?? 300;
      const duration = e?.duration && e.duration > 0 ? e.duration : 200;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 0,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 16,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const onHide = (e: KeyboardEvent) => {
      setKeyboardVisible(false);
      keyboardHeightRef.current = 0;
      const duration = e?.duration && e.duration > 0 ? e.duration : 220;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [footerOpacity, footerTranslateY]);

  const bioFieldRef = useRef<View>(null);
  const experienceFieldRef = useRef<View>(null);
  const serviceAreaRef = useRef<View>(null);

  const scrollToRef = useCallback((ref: React.RefObject<View | null>) => {
    if (!ref.current || !scrollRef.current) return;
    ref.current.measureLayout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scrollRef.current as unknown as any,
      (_x, y, _w, h) => {
        // Visible screen above the keyboard
        const { height: screenHeight } = Dimensions.get("window");
        const visibleHeight = screenHeight - keyboardHeightRef.current;
        const targetTopInViewport = Math.max(24, (visibleHeight - h) / 2);
        const targetY = y - targetTopInViewport;
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
      },
      () => {},
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<ReadonlyArray<SpecialtyOption>>([]);
  const [application, setApplication] = useState<TaskerApplicationRecord | null>(null);
  const [specialties, setSpecialties] = useState<ReadonlyArray<string>>([]);
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [payoutProvider, setPayoutProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const prefill = useCallback((record: TaskerApplicationRecord | null) => {
    setSpecialties(record?.specialtyIds ?? []);
    setCityCode(record?.cityCode ?? "");
    setBarangayCode(record?.barangayCode ?? "");
    setBio(record?.bio ?? "");
    setExperience(record?.experience ?? "");
    setPayoutProvider(record?.payoutProvider ?? null);
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [specialtyOptions, record] = await Promise.all([
        repository.listSpecialtyOptions(),
        repository.getMyTaskerApplication(userId),
      ]);
      setOptions(specialtyOptions);
      setApplication(record);
      prefill(record);
    } catch {
      setLoadError("Your application could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [prefill, repository, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const [resolvedLocation, setResolvedLocation] = useState<{
    city: string | null;
    barangay: string | null;
  }>({
    city: null,
    barangay: null,
  });

  useEffect(() => {
    let active = true;
    const targetCity = application?.cityCode || cityCode;
    const targetBrgy = application?.barangayCode || barangayCode;

    if (targetCity) {
      void Promise.all([
        repository.getCityByCode(targetCity),
        targetBrgy ? repository.getBarangayByCode(targetBrgy) : Promise.resolve(null),
      ]).then(([city, brgy]) => {
        if (active) {
          setResolvedLocation({
            city: city?.name ?? null,
            barangay: brgy?.name ?? null,
          });
        }
      });
    } else {
      setResolvedLocation({ city: null, barangay: null });
    }
    return () => {
      active = false;
    };
  }, [application?.cityCode, application?.barangayCode, cityCode, barangayCode, repository]);

  const specialtyNames = useMemo(() => {
    const list = application?.specialtyIds?.length ? application.specialtyIds : specialties;
    if (!list || list.length === 0) return [];
    return list.map((id) => {
      const match = options.find((opt) => opt.id === id || opt.slug === id);
      return match?.name || match?.slug || id;
    });
  }, [application?.specialtyIds, specialties, options]);

  const showForm = useMemo(() => {
    if (!application) return true;
    return (
      application.status === "DRAFT" ||
      application.status === "REJECTED" ||
      application.status === "RESUBMISSION_REQUIRED"
    );
  }, [application]);

  const completion = useMemo(() => {
    const checks = [
      specialties.length > 0,
      cityCode.trim().length > 0,
      bio.trim().length >= 20,
      experience.trim().length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [bio, cityCode, experience, specialties]);

  function markChanged() {
    setError(null);
  }

  function toggleSpecialty(id: string) {
    markChanged();
    setSpecialties((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSubmit() {
    if (!userId || submitting) return;
    if (specialties.length === 0) {
      setError("Choose at least one specialty.");
      return;
    }
    if (!cityCode.trim()) {
      setError("Select the city for your service area.");
      return;
    }
    if (bio.trim().length < 20) {
      setError("Your professional bio must contain at least 20 characters.");
      return;
    }
    if (!experience.trim()) {
      setError("Describe your relevant work experience.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await repository.submitTaskerApplication(userId, {
        bio,
        experience,
        specialtyIds: specialties,
        cityCode,
        barangayCode,
        payoutProvider,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setApplication(result.application);
      prefill(result.application);
      notifyChanged();
    } catch {
      setError("Could not submit your application. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  const intro = applicationIntro(application?.status ?? null);

  return (
    <Screen subPageTitle="Tasker application" scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <LoadingState label="Loading your application" />
      ) : loadError ? (
        <ErrorState title="Could not load application" description={loadError} onRetry={load} />
      ) : (
        <View style={styles.page}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingHorizontal: gutter, paddingBottom: keyboardVisible ? 380 : 120 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={true}
            showsVerticalScrollIndicator={false}
          >
            <ScreenScrollProvider scrollViewRef={scrollRef}>
              <View style={styles.contentFrame}>
                {application && REVIEW_STATUSES.has(application.status) ? (
                  <View style={styles.reviewHeroContainer}>
                    {/* Hero Badge Ring */}
                    <View style={styles.heroBadgeContainer}>
                      <View style={styles.heroIconRingReview}>
                        <Icon name="clock" size={42} color="#D97706" />
                      </View>
                      <View style={styles.heroMiniReviewBadge}>
                        <Icon name="shield" size={14} color="#FFFFFF" />
                      </View>
                    </View>

                    {/* Title & Subtitle */}
                    <View style={styles.heroTextBlock}>
                      <Text style={styles.heroTitle}>
                        {application.status === "IN_REVIEW" ? "Review In Progress" : "Application Submitted"}
                      </Text>
                      <Text style={styles.heroSubtitle}>
                        Your Tasker profile and qualifications are currently with our manual review team. We typically review applications within 1–2 business days.
                      </Text>
                    </View>

                    {/* Application Details Summary Card */}
                    <View style={styles.credentialCard}>
                      <View style={styles.credentialCardHeader}>
                        <View style={styles.credentialHeaderTitleRow}>
                          <Icon name="note" size={18} color={theme.primary} />
                          <Text style={styles.credentialCardTitle}>Application Summary</Text>
                        </View>
                      </View>

                      <View style={styles.metaList}>
                        {/* Full width Applicant */}
                        <View style={styles.metaBlockFull}>
                          <Text style={styles.metaLabel}>APPLICANT</Text>
                          <Text style={styles.metaValueFull}>
                            {session?.displayName || "Tasker Applicant"}
                          </Text>
                        </View>

                        {/* 2-Column Metadata Grid for submitted date & payout */}
                        <View style={styles.metaGrid}>
                          <View style={styles.metaBlock}>
                            <Text style={styles.metaLabel}>SUBMITTED ON</Text>
                            <Text style={styles.metaValue} numberOfLines={1}>
                              {new Date(application.submittedAt || Date.now()).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                          </View>

                          <View style={styles.metaBlock}>
                            <Text style={styles.metaLabel}>PAYOUT METHOD</Text>
                            <Text style={styles.metaValue} numberOfLines={1}>
                              {application.payoutProvider === "gcash"
                                ? "GCash"
                                : application.payoutProvider === "maya"
                                  ? "Maya"
                                  : application.payoutProvider === "bank"
                                    ? "Bank Transfer"
                                    : application.payoutProvider || "Not set"}
                            </Text>
                          </View>
                        </View>

                        {/* Full-width responsive Service Area */}
                        {resolvedLocation.city ? (
                          <View style={styles.sectionBlock}>
                            <Text style={styles.metaLabel}>SERVICE AREA</Text>
                            <Text style={styles.locationValueText}>
                              {resolvedLocation.barangay
                                ? `${resolvedLocation.barangay}, ${resolvedLocation.city}`
                                : resolvedLocation.city}
                            </Text>
                          </View>
                        ) : null}

                        {/* Full-width responsive Specialties */}
                        {specialtyNames.length > 0 ? (
                          <View style={styles.sectionBlock}>
                            <Text style={styles.metaLabel}>SPECIALTIES</Text>
                            <View style={styles.specialtiesPillWrap}>
                              {specialtyNames.map((name, idx) => (
                                <View key={idx} style={styles.specialtyTagPill}>
                                  <Text style={styles.specialtyTagText}>{name}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Application Next Steps Timeline */}
                    <View style={styles.roadmapCard}>
                      <Text style={styles.roadmapTitle}>Application Next Steps</Text>
                      <View style={styles.roadmapList}>
                        {/* Step 1 */}
                        <View style={styles.roadmapItem}>
                          <View style={styles.roadmapStepContent}>
                            <Text style={styles.roadmapStepTitleCompleted}>1. Application Received</Text>
                            <Text style={styles.roadmapStepDesc}>
                              Your bio, work experience, specialties, and service area are safely recorded.
                            </Text>
                          </View>
                          <View style={styles.roadmapBareIcon}>
                            <Icon name="check-circle" size={18} color="#059669" />
                          </View>
                        </View>

                        {/* Step 2 */}
                        <View style={styles.roadmapItem}>
                          <View style={styles.roadmapStepContent}>
                            <Text style={styles.roadmapStepTitleActive}>2. Manual Review</Text>
                            <Text style={styles.roadmapStepDesc}>
                              Our team verifies your profile details to maintain trust and quality across the marketplace.
                            </Text>
                          </View>
                          <View style={styles.roadmapBareIcon}>
                            <Icon name="clock" size={18} color="#D97706" />
                          </View>
                        </View>

                        {/* Step 3 */}
                        <View style={styles.roadmapItem}>
                          <View style={styles.roadmapStepContent}>
                            <Text style={styles.roadmapStepTitlePending}>3. Tasker Activation</Text>
                            <Text style={styles.roadmapStepDesc}>
                              Once approved, you will be able to make offers on open tasks and receive protected payouts.
                            </Text>
                          </View>
                          <View style={styles.roadmapBareIcon}>
                            <Icon name="lock" size={18} color={theme.textSecondary} />
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Notification Note */}
                    <View style={styles.notificationNoticeBlock}>
                      <View style={styles.noticeHeaderRow}>
                        <Icon name="shield" size={18} color={theme.infoOnSoft} />
                        <Text style={styles.noticeHeading}>You will be notified</Text>
                      </View>
                      <Text style={styles.noticeBody}>
                        You'll receive an in-app notification when the review is complete. You can continue using Dizkarte to post and browse tasks in the meantime.
                      </Text>
                    </View>

                    {/* Back to profile action button */}
                    <View style={styles.heroActionContainer}>
                      <Button
                        label="Back to profile"
                        onPress={() => router.replace("/(tabs)/profile")}
                        fullWidth
                      />
                    </View>
                  </View>
                ) : application?.status === "APPROVED" ? (
                  <View style={styles.reviewHeroContainer}>
                    <View style={styles.heroBadgeContainer}>
                      <View style={styles.heroIconRingSuccess}>
                        <Icon name="check-circle" size={44} color="#10B981" />
                      </View>
                    </View>

                    <View style={styles.heroTextBlock}>
                      <Text style={styles.heroTitle}>You are an approved Tasker</Text>
                      <Text style={styles.heroSubtitle}>
                        Your Tasker profile is active and verified. You can bid on open tasks, chat with clients, and manage your specialties.
                      </Text>
                    </View>

                    <View style={styles.heroActionContainer}>
                      <Button
                        label="Edit public profile"
                        icon="edit"
                        onPress={() => router.replace("/profile/edit")}
                        fullWidth
                      />
                    </View>
                  </View>
                ) : application?.status === "SUSPENDED" ? (
                  <View style={styles.reviewHeroContainer}>
                    <View style={styles.heroBadgeContainer}>
                      <View style={styles.heroIconRingError}>
                        <Icon name="alert-circle" size={44} color="#EF4444" />
                      </View>
                    </View>

                    <View style={styles.heroTextBlock}>
                      <Text style={styles.heroTitle}>Tasker access suspended</Text>
                      <Text style={styles.heroSubtitle}>
                        {application.decisionReason ??
                          "Contact Dizkarte support to understand the decision and available next steps."}
                      </Text>
                    </View>

                    <View style={styles.heroActionContainer}>
                      <Button
                        label="Contact support"
                        variant="secondary"
                        onPress={() => router.push("/support")}
                        fullWidth
                      />
                    </View>
                  </View>
                ) : null}

                {showForm ? (
                  <>
                    <ProfilePageIntro title={intro.title} description={intro.description} />

                    <View style={styles.reviewNotice}>
                      <View style={styles.noticeHeader}>
                        <Icon name="shield" size={21} color={theme.infoOnSoft} />
                        <Text style={styles.noticeTitle}>Manual application review</Text>
                      </View>
                      <Text style={styles.noticeDescription}>
                        Dizkarte reviews every application before Tasker capabilities are enabled. Your
                        ratings and verification status cannot be edited here.
                      </Text>
                    </View>
                  {application?.decisionReason ? (
                    <ApplicationStatusPanel
                      icon="alert-circle"
                      title={
                        application.status === "RESUBMISSION_REQUIRED"
                          ? "Changes requested"
                          : "Previous application decision"
                      }
                      description={application.decisionReason}
                      tone="warning"
                    />
                  ) : null}

                  <View style={styles.progressCard}>
                    <View style={styles.progressHeader}>
                      <View style={styles.progressHeaderInfo}>
                        <Text style={styles.progressTitle}>Application readiness</Text>
                        <Text style={styles.progressCaption}>
                          Complete every required section before submitting.
                        </Text>
                      </View>
                      <Text style={styles.progressValue}>{completion}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${completion}%` }]} />
                    </View>
                  </View>

                  {error ? (
                    <View style={styles.errorNotice} accessibilityRole="alert">
                      <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.formGrid, isTablet ? styles.formGridTablet : null]}>
                    <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
                      <ProfilePageSection
                        icon="briefcase"
                        title="Specialties"
                        description="Choose every service you are qualified and prepared to offer."
                        showDivider={false}
                      >
                        <View style={styles.chipRow}>
                          {options.map((option) => {
                            const selected = specialties.includes(option.id);
                            return (
                              <SelectChip
                                key={option.id}
                                label={option.name}
                                selected={selected}
                                wide={isTablet}
                                onPress={() => toggleSpecialty(option.id)}
                              />
                            );
                          })}
                        </View>
                      </ProfilePageSection>
                    </View>

                    <View
                      ref={serviceAreaRef}
                      style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}
                    >
                      <ProfilePageSection
                        icon="map-pin"
                        title="Service area"
                        description="Choose the city and barangay where you can accept work."
                      >
                        <LocalityPicker
                          value={{
                            cityCode: cityCode.length > 0 ? cityCode : null,
                            barangayCode: barangayCode.length > 0 ? barangayCode : null,
                          }}
                          onChange={(next) => {
                            markChanged();
                            setCityCode(next.cityCode ?? "");
                            setBarangayCode(next.barangayCode ?? "");
                          }}
                          onOpen={() => scrollToRef(serviceAreaRef)}
                          onClose={() => scrollToRef(serviceAreaRef)}
                          cityLabel="Service city / municipality"
                          cityRequired
                        />
                      </ProfilePageSection>
                    </View>
                  </View>

                  <ProfilePageSection
                    icon="user"
                    title="Professional profile"
                    description="Explain what you do well and the experience clients can rely on."
                  >
                    <View ref={bioFieldRef}>
                      <TextField
                        label="Professional bio"
                        required
                        multiline
                        numberOfLines={4}
                        description="At least 20 characters. Clients see this on your offers."
                        value={bio}
                        onChangeText={(text) => {
                          markChanged();
                          setBio(text);
                        }}
                        onFocus={() => scrollToRef(bioFieldRef)}
                        maxLength={2000}
                        placeholder="Introduce yourself and the services you provide."
                      />
                    </View>
                    <View ref={experienceFieldRef}>
                      <TextField
                        label="Relevant experience"
                        required
                        multiline
                        numberOfLines={4}
                        description="Describe completed work, practical skills, or professional experience."
                        value={experience}
                        onChangeText={(text) => {
                          markChanged();
                          setExperience(text);
                        }}
                        onFocus={() => scrollToRef(experienceFieldRef)}
                        maxLength={2000}
                        placeholder="Summarize your experience."
                      />
                    </View>
                  </ProfilePageSection>

                  <ProfilePageSection
                    icon="wallet"
                    title="Preferred payout provider"
                    description="Optional. Choose a provider preference only—never enter a wallet, bank, or card number here."
                    showDivider={false}
                  >
                    <View style={styles.providerGrid}>
                      {PAYOUT_PROVIDERS.map((provider) => {
                        const selected = payoutProvider === provider.value;
                        return (
                          <Pressable
                            key={provider.value}
                            onPress={() => {
                              markChanged();
                              setPayoutProvider(selected ? null : provider.value);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={provider.label}
                            style={({ pressed }) => [
                              styles.providerCard,
                              selected ? styles.providerCardSelected : null,
                              pressed ? styles.providerCardPressed : null,
                            ]}
                          >
                            <ProviderMark mark={provider.mark} />
                            {provider.mark === "bank" ? (
                              <Text style={styles.providerLabel}>{provider.label}</Text>
                            ) : null}
                            {selected ? (
                              <View style={styles.providerSelectedMark}>
                                <Icon name="check-circle" size={17} color={theme.primary} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.providerNote}>
                      Secure payout linking happens after approval through the configured payout
                      provider.
                    </Text>
                  </ProfilePageSection>
                </>
              ) : null}
            </View>
          </ScreenScrollProvider>
        </ScrollView>

          {showForm ? (
            <Animated.View
              pointerEvents={keyboardVisible ? "none" : "auto"}
              style={[
                styles.stickyOverlayFooter,
                {
                  paddingVertical: spacing.md,
                  opacity: footerOpacity,
                  transform: [{ translateY: footerTranslateY }],
                },
              ]}
            >
              <View style={[styles.actionFooterInner, { paddingHorizontal: gutter }]}>
                <View style={styles.cancelAction}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => router.back()}
                    disabled={submitting}
                    fullWidth
                  />
                </View>
                <View style={styles.submitAction}>
                  <Button
                    label={
                      application?.status === "RESUBMISSION_REQUIRED"
                        ? "Resubmit application"
                        : "Submit application"
                    }
                    icon="send"
                    onPress={() => void handleSubmit()}
                    loading={submitting}
                    fullWidth
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function ProviderMark({ mark }: { readonly mark: "gcash" | "maya" | "bank" }) {
  if (mark === "gcash") {
    return (
      <View style={styles.providerLogoSlot}>
        <Image
          // Official first-party wordmark; source is documented beside the assets.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../assets/payment-providers/gcash.png")}
          style={styles.gcashLogo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  if (mark === "maya") {
    return (
      <View style={[styles.providerLogoSlot, styles.mayaLogoSlot]}>
        <Image
          // Official first-party wordmark; source is documented beside the assets.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../assets/payment-providers/maya.png")}
          style={styles.mayaLogo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  return <Icon name="bank" size={23} color={theme.primary} />;
}

function SelectChip({
  label,
  selected,
  wide,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly wide: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        wide ? styles.chipWide : styles.chipCompact,
        selected ? styles.chipSelected : null,
        pressed ? styles.chipPressed : null,
      ]}
    >
      {selected ? <Icon name="check-circle" size={15} color={theme.onPrimary} /> : null}
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ApplicationStatusPanel({
  icon,
  title,
  description,
  tone,
  action,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly tone: "info" | "success" | "warning" | "error";
  readonly action?: ReactNode;
}) {
  const colors = {
    info: { background: theme.infoSoft, text: theme.infoOnSoft },
    success: { background: theme.successSoft, text: theme.successOnSoft },
    warning: { background: theme.warningSoft, text: theme.warningOnSoft },
    error: { background: theme.errorSoft, text: theme.errorOnSoft },
  }[tone];

  return (
    <View style={[styles.statusPanel, { backgroundColor: colors.background }]}>
      <View style={styles.statusHeader}>
        <Icon name={icon} size={22} color={colors.text} />
        <Text style={[styles.statusTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.statusDescription, { color: colors.text }]}>{description}</Text>
      {action ? <View style={styles.statusAction}>{action}</View> : null}
    </View>
  );
}

function applicationIntro(status: TaskerApplicationRecord["status"] | null): {
  readonly title: string;
  readonly description: string;
} {
  switch (status) {
    case "SUBMITTED":
      return {
        title: "Application submitted",
        description: "Your Tasker application is waiting for manual review.",
      };
    case "IN_REVIEW":
      return {
        title: "Application in review",
        description: "An assigned Admin reviewer is checking your application.",
      };
    case "APPROVED":
      return {
        title: "Tasker application approved",
        description: "Your Tasker capability is active and your public profile can be managed.",
      };
    case "RESUBMISSION_REQUIRED":
      return {
        title: "Update your application",
        description: "Review the requested changes, update your details, and submit again.",
      };
    case "REJECTED":
      return {
        title: "Apply again as a Tasker",
        description: "Review the previous decision and submit a stronger application.",
      };
    case "SUSPENDED":
      return {
        title: "Tasker access suspended",
        description: "Review the status details and contact support for assistance.",
      };
    case "DRAFT":
    case null:
      return {
        title: "Become a Tasker",
        description: "Tell us about your skills, service area, and experience.",
      };
  }
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: spacing.lg },
  contentFrame: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.lg,
  },
  reviewNotice: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: theme.infoSoft,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: theme.infoOnSoft,
  },
  noticeDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.infoOnSoft,
  },
  progressCard: {
    minWidth: 0,
    width: "100%",
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  progressHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  progressHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  progressTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  progressCaption: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  progressValue: {
    flexShrink: 0,
    textAlign: "right",
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.primary,
  },
  progressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: theme.borderSubtle,
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: theme.primary,
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  formGrid: {
    gap: spacing.md,
  },
  formGridTablet: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  gridItem: {
    minWidth: 0,
  },
  gridItemTablet: {
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  chip: {
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.pill,
    backgroundColor: theme.surface,
  },
  chipCompact: {
    flexGrow: 1,
    flexBasis: "47%",
  },
  chipWide: {
    flexGrow: 1,
    flexBasis: "31%",
  },
  chipSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  chipPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    textAlign: "center",
  },
  chipTextSelected: {
    color: theme.onPrimary,
  },
  providerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  providerCard: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    position: "relative",
  },
  providerCardSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  providerCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  providerLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  providerSelectedMark: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  providerLogoSlot: {
    width: 100,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  mayaLogoSlot: {
    transform: [{ translateY: 4 }],
  },
  gcashLogo: {
    width: 92,
    height: 22,
  },
  mayaLogo: {
    width: 84,
    height: 25,
  },
  providerNote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  statusPanel: {
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  statusHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  statusDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  statusAction: {
    width: "100%",
  },
  stickyOverlayFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  actionFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cancelAction: {
    flex: 0.85,
  },
  submitAction: {
    flex: 1.15,
  },

  // Redesigned Review Status Hero
  reviewHeroContainer: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroBadgeContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    position: "relative",
    alignSelf: "center",
  },
  heroIconRingReview: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  heroMiniReviewBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  heroIconRingSuccess: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  heroIconRingError: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTextBlock: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    textAlign: "center",
    maxWidth: 480,
  },
  credentialCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  credentialCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credentialHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  credentialCardTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  pendingStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingStatusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
    letterSpacing: 0.2,
  },
  credentialDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.md,
    columnGap: spacing.sm,
  },
  metaList: {
    gap: spacing.md,
  },
  metaBlockFull: {
    gap: 3,
  },
  metaValueFull: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  metaBlock: {
    width: "48%",
    flexGrow: 1,
    gap: 3,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.textSecondary,
  },
  metaValue: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  monospaceText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
  },
  sectionBlock: {
    gap: 5,
  },
  locationValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationValueText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  specialtiesPillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  specialtyTagPill: {
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(92, 56, 222, 0.15)",
  },
  specialtyTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
  },
  roadmapCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  roadmapTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  roadmapList: {
    gap: spacing.md,
  },
  roadmapItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm + 2,
  },
  roadmapBareIcon: {
    width: 20,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  roadmapStepContent: {
    flex: 1,
    gap: 2,
  },
  roadmapStepTitleCompleted: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#065F46",
  },
  roadmapStepTitleActive: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: "#B45309",
  },
  roadmapStepTitlePending: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  roadmapStepDesc: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  notificationNoticeBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  noticeHeading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
  },
  noticeBody: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    textAlign: "center",
    maxWidth: 480,
  },
  heroActionContainer: {
    marginTop: spacing.xs,
    width: "100%",
  },
});




