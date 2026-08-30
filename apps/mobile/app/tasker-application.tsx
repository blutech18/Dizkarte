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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
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

  const scrollContentRef = useRef<View>(null);
  const bioFieldRef = useRef<View>(null);
  const experienceFieldRef = useRef<View>(null);
  const serviceAreaRef = useRef<View>(null);

  const scrollToRef = useCallback((ref: React.RefObject<View | null>) => {
    if (!ref.current || !scrollRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.current.measureLayout(
      scrollRef.current as unknown as any,
      (x, y, w, h) => {
        // Visible screen above the keyboard
        const { height: screenHeight } = Dimensions.get("window");
        const visibleHeight = screenHeight - keyboardHeightRef.current;
        // Place the field near the top of the visible area with a small gap
        const targetY = y - Math.max(16, (visibleHeight - h) / 4);
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

              {application && REVIEW_STATUSES.has(application.status) ? (
                <ApplicationStatusPanel
                  icon="calendar"
                  title={
                    application.status === "IN_REVIEW"
                      ? "Review in progress"
                      : "Application submitted"
                  }
                  description="You will receive a notification when the Admin team makes a decision. Offers remain unavailable until approval."
                  tone="info"
                  action={
                    <Button
                      label="Back to profile"
                      variant="secondary"
                      onPress={() => router.replace("/(tabs)/profile")}
                      fullWidth
                    />
                  }
                />
              ) : application?.status === "APPROVED" ? (
                <ApplicationStatusPanel
                  icon="check-circle"
                  title="You are an approved Tasker"
                  description="Manage your public bio, experience, and specialties from Edit Profile."
                  tone="success"
                  action={
                    <Button
                      label="Edit public profile"
                      icon="edit"
                      onPress={() => router.replace("/profile/edit")}
                      fullWidth
                    />
                  }
                />
              ) : application?.status === "SUSPENDED" ? (
                <ApplicationStatusPanel
                  icon="alert-circle"
                  title="Tasker access suspended"
                  description={
                    application.decisionReason ??
                    "Contact support to understand the decision and available next steps."
                  }
                  tone="error"
                  action={
                    <Button
                      label="Contact support"
                      variant="secondary"
                      onPress={() => router.push("/support")}
                      fullWidth
                    />
                  }
                />
              ) : null}

              {showForm ? (
                <>
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
});
