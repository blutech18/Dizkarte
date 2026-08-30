import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
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
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { LocalityPicker } from "../../src/components/task/LocalityPicker";
import { Button } from "../../src/components/ui/Button";
import { LoadingState, ErrorState } from "../../src/components/ui/AsyncState";
import { Icon } from "../../src/components/ui/Icon";
import {
  ProfilePageIntro,
  ProfilePageSection,
} from "../../src/components/profile/ProfilePageSection";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { ScreenScrollProvider } from "../../src/providers/ScreenScrollContext";
import type { MyProfileRecord, SpecialtyOption } from "../../src/services/marketplace";
import { theme, spacing, fontSize, radii, useResponsiveLayout } from "../../src/theme";

export default function EditProfileScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const insets = useSafeAreaInsets();
  const { gutter, isTablet } = useResponsiveLayout();

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

  const displayNameRef = useRef<View>(null);
  const mobileRef = useRef<View>(null);
  const bioRef = useRef<View>(null);
  const localityRef = useRef<View>(null);
  const publicBioRef = useRef<View>(null);
  const publicExperienceRef = useRef<View>(null);

  const scrollToRef = useCallback((ref: React.RefObject<View | null>) => {
    if (!ref.current || !scrollRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.current.measureLayout(
      scrollRef.current as unknown as any,
      (x, y, w, h) => {
        const { height: screenHeight } = Dimensions.get("window");
        const visibleHeight = screenHeight - keyboardHeightRef.current;
        const targetY = y - Math.max(16, (visibleHeight - h) / 4);
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
      },
      () => {},
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfileRecord | null>(null);
  const [specialties, setSpecialties] = useState<ReadonlyArray<SpecialtyOption>>([]);
  const [displayName, setDisplayName] = useState("");
  const [mobile, setMobile] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [bio, setBio] = useState("");
  const [publicBio, setPublicBio] = useState("");
  const [publicExperience, setPublicExperience] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<ReadonlyArray<string>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [record, specialtyList] = await Promise.all([
        repository.getMyProfile(session.userId),
        repository.listSpecialtyOptions(),
      ]);
      setProfile(record);
      setSpecialties(specialtyList);
      setDisplayName(record.displayName);
      setMobile(record.mobile ?? "");
      setCityCode(record.cityCode ?? "");
      setBarangayCode(record.barangayCode ?? "");
      setBio(record.bio);
      setPublicBio(record.tasker?.publicBio ?? "");
      setPublicExperience(record.tasker?.publicExperience ?? "");
      setSelectedSpecialties(record.tasker?.specialtyIds ?? []);
    } catch {
      setLoadError("Your profile could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [repository, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const markChanged = () => {
    setSaved(false);
    setFormError(null);
  };

  const toggleSpecialty = (id: string) => {
    markChanged();
    setSelectedSpecialties((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  async function handleSave() {
    if (!session || !displayName.trim()) return;
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await repository.updateMyProfile(session.userId, {
        displayName: displayName.trim(),
        mobile: mobile.trim() || undefined,
        cityCode: cityCode || undefined,
        barangayCode: barangayCode || undefined,
        bio: bio.trim(),
        ...(profile?.tasker
          ? {
              publicBio: publicBio.trim(),
              publicExperience: publicExperience.trim(),
              specialtyIds: selectedSpecialties,
              serviceCityCodes: cityCode.trim().length > 0 ? [cityCode.trim()] : [],
            }
          : {}),
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setProfile(result.profile);
      setDisplayName(result.profile.displayName);
      setMobile(result.profile.mobile ?? "");
      setCityCode(result.profile.cityCode ?? "");
      setBarangayCode(result.profile.barangayCode ?? "");
      setBio(result.profile.bio);
      setSaved(true);
      notifyChanged();
    } catch {
      setFormError("Could not save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Screen subPageTitle="Edit profile" scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <LoadingState label="Loading your profile" />
      ) : loadError || !profile ? (
        <ErrorState
          title="Could not load profile"
          description={loadError ?? "Your profile is unavailable."}
          onRetry={load}
        />
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
              <ProfilePageIntro
                title="Update your profile"
                description="Keep your private account details accurate and your public Tasker information clear."
              />

              {formError ? (
                <View style={styles.errorNotice} accessibilityRole="alert">
                  <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}
              {saved ? (
                <View style={styles.successNotice} accessibilityLiveRegion="polite">
                  <Icon name="check-circle" size={20} color={theme.successOnSoft} />
                  <Text style={styles.successText}>Your profile has been updated.</Text>
                </View>
              ) : null}

              <View style={[styles.grid, isTablet ? styles.gridTablet : null]}>
                <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
                  <ProfilePageSection
                    icon="user"
                    title="Personal details"
                    description="Private contact and account information."
                  >
                    <View ref={displayNameRef}>
                      <TextField
                        label="Full name"
                        required
                        value={displayName}
                        onChangeText={(text) => {
                          markChanged();
                          setDisplayName(text);
                        }}
                        onFocus={() => scrollToRef(displayNameRef)}
                        textContentType="name"
                      />
                    </View>
                    <View ref={mobileRef}>
                      <TextField
                        label="Mobile number"
                        description="Philippine mobile number. Never shown publicly."
                        value={mobile}
                        onChangeText={(text) => {
                          markChanged();
                          setMobile(text);
                        }}
                        onFocus={() => scrollToRef(mobileRef)}
                        keyboardType="phone-pad"
                        placeholder="0917 123 4567"
                      />
                    </View>
                    <View ref={bioRef}>
                      <TextField
                        label="About you"
                        description="A short private account note."
                        value={bio}
                        onChangeText={(text) => {
                          markChanged();
                          setBio(text);
                        }}
                        onFocus={() => scrollToRef(bioRef)}
                        multiline
                        numberOfLines={3}
                      />
                    </View>
                  </ProfilePageSection>
                </View>

                <View
                  ref={localityRef}
                  style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}
                >
                  <ProfilePageSection
                    icon="map-pin"
                    title="Usual area"
                    description="Choose the city and barangay for your account and service area."
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
                      onOpen={() => scrollToRef(localityRef)}
                      onClose={() => scrollToRef(localityRef)}
                      cityLabel="City / Municipality"
                    />
                  </ProfilePageSection>
                </View>
              </View>

              {profile.tasker ? (
                <ProfilePageSection
                  icon="briefcase"
                  title="Public Tasker profile"
                  description="Clients see this information on your offers. Ratings, completed jobs, and verification are managed by Dizkarte."
                >
                  <View ref={publicBioRef}>
                    <TextField
                      label="Public bio"
                      value={publicBio}
                      onChangeText={(text) => {
                        markChanged();
                        setPublicBio(text);
                      }}
                      onFocus={() => scrollToRef(publicBioRef)}
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                  <View ref={publicExperienceRef}>
                    <TextField
                      label="Experience"
                      value={publicExperience}
                      onChangeText={(text) => {
                        markChanged();
                        setPublicExperience(text);
                      }}
                      onFocus={() => scrollToRef(publicExperienceRef)}
                      multiline
                      numberOfLines={4}
                    />
                  </View>

                  <Text style={styles.fieldLabel}>Specialties</Text>
                  <Text style={styles.fieldHint}>
                    Choose every service you are qualified to offer.
                  </Text>
                  <View style={styles.chipRow}>
                    {specialties.map((option) => {
                      const selected = selectedSpecialties.includes(option.id);
                      return (
                        <Pressable
                          key={option.id}
                          onPress={() => toggleSpecialty(option.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={option.name}
                          style={({ pressed }) => [
                            styles.chip,
                            selected ? styles.chipSelected : null,
                            pressed ? styles.chipPressed : null,
                          ]}
                        >
                          {selected ? (
                            <Icon name="check-circle" size={15} color={theme.onPrimary} />
                          ) : null}
                          <Text
                            style={[styles.chipText, selected ? styles.chipTextSelected : null]}
                          >
                            {option.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ProfilePageSection>
              ) : null}
            </View>
          </ScreenScrollProvider>
          </ScrollView>

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
            <View style={[styles.stickyFooterInner, { paddingHorizontal: gutter }]}>
              <View style={styles.cancelAction}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => router.back()}
                  disabled={saving}
                  fullWidth
                />
              </View>
              <View style={styles.saveAction}>
                <Button
                  label="Save changes"
                  icon="check-circle"
                  onPress={() => void handleSave()}
                  loading={saving}
                  disabled={!displayName.trim()}
                  fullWidth
                />
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </Screen>
  );
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
  grid: {
    gap: spacing.md,
  },
  gridTablet: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  gridItem: {
    minWidth: 0,
  },
  gridItemTablet: {
    flex: 1,
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
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  successNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.successSoft,
  },
  successText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.successOnSoft,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  fieldHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.pill,
    backgroundColor: theme.surface,
  },
  chipSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  stickyOverlayFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: spacing.md,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  stickyFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cancelAction: { flex: 0.85 },
  saveAction: { flex: 1.15 },
});
