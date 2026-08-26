import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import type { MyProfileRecord, SpecialtyOption } from "../../src/services/marketplace";
import { theme, spacing, fontSize, radii, useResponsiveLayout } from "../../src/theme";

export default function EditProfileScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const insets = useSafeAreaInsets();
  const { gutter, isTablet } = useResponsiveLayout();

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
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const userId = session?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [record, options] = await Promise.all([
        repository.getMyProfile(userId),
        repository.listSpecialtyOptions(),
      ]);
      if (!record) {
        setLoadError("Your profile could not be loaded.");
        return;
      }
      setProfile(record);
      setSpecialties(options);
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
  }, [repository, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function markChanged() {
    setSaved(false);
    setFormError(null);
  }

  function toggleSpecialty(id: string) {
    markChanged();
    setSelectedSpecialties((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSave() {
    if (!userId || !profile || saving) return;
    setFormError(null);
    setSaved(false);
    setSaving(true);
    try {
      const result = await repository.updateMyProfile(userId, {
        displayName,
        mobile,
        cityCode,
        barangayCode,
        bio,
        ...(profile.tasker
          ? {
              publicBio,
              publicExperience,
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
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingHorizontal: gutter, paddingBottom: spacing.xl },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
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
                    <TextField
                      label="Full name"
                      required
                      value={displayName}
                      onChangeText={(text) => {
                        markChanged();
                        setDisplayName(text);
                      }}
                      textContentType="name"
                    />
                    <TextField
                      label="Mobile number"
                      description="Philippine mobile number. Never shown publicly."
                      value={mobile}
                      onChangeText={(text) => {
                        markChanged();
                        setMobile(text);
                      }}
                      keyboardType="phone-pad"
                      placeholder="0917 123 4567"
                    />
                    <TextField
                      label="About you"
                      description="A short private account note."
                      value={bio}
                      onChangeText={(text) => {
                        markChanged();
                        setBio(text);
                      }}
                      multiline
                      numberOfLines={3}
                    />
                  </ProfilePageSection>
                </View>

                <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
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
                  <TextField
                    label="Public bio"
                    value={publicBio}
                    onChangeText={(text) => {
                      markChanged();
                      setPublicBio(text);
                    }}
                    multiline
                    numberOfLines={4}
                  />
                  <TextField
                    label="Experience"
                    value={publicExperience}
                    onChangeText={(text) => {
                      markChanged();
                      setPublicExperience(text);
                    }}
                    multiline
                    numberOfLines={4}
                  />

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
          </ScrollView>

          <View
            style={[styles.actionFooter, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
          >
            <View style={[styles.actionFooterInner, { paddingHorizontal: gutter }]}>
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
          </View>
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
  chipTextSelected: {
    color: theme.onPrimary,
  },
  actionFooter: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: spacing.sm,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  actionFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelAction: { flex: 0.72 },
  saveAction: { flex: 1.28 },
});
