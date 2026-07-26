import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { LoadingState, ErrorState } from "../../src/components/ui/AsyncState";
import { Icon } from "../../src/components/ui/Icon";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { MyProfileRecord, SpecialtyOption } from "../../src/services/marketplace";
import { theme, spacing, fontSize, radii } from "../../src/theme";

/**
 * Profile editor.
 *
 * Only fields the signed-in user is actually allowed to change are shown. The
 * Tasker section appears solely for an approved, unsuspended Tasker profile,
 * mirroring the backend rule — trust signals (rating, completed jobs,
 * verification) are read-only platform data and are never presented as editable.
 */
export default function EditProfileScreen() {
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();

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

  function toggleSpecialty(id: string) {
    setSelectedSpecialties((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSave() {
    if (!userId || !profile) return;
    setFormError(null);
    setSaved(false);
    setSaving(true);
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
            // Service coverage follows the profile's city while a dedicated
            // multi-area editor is out of scope for this pass.
            serviceCityCodes: cityCode.trim().length > 0 ? [cityCode.trim()] : [],
          }
        : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setProfile(result.profile);
    setSaved(true);
    // Offers and task detail render the Tasker's public profile, so shared
    // lists must refetch.
    notifyChanged();
  }

  if (!session) return null;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit profile" }} />
      <Screen>
        {loading ? (
          <LoadingState label="Loading your profile" />
        ) : loadError ? (
          <ErrorState title="Could not load profile" description={loadError} onRetry={load} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {formError ? (
              <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {formError}
              </Text>
            ) : null}
            {saved ? (
              <Text style={styles.formSuccess} accessibilityLiveRegion="polite">
                Profile updated.
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Your details</Text>
            <TextField
              label="Full name"
              required
              value={displayName}
              onChangeText={setDisplayName}
              textContentType="name"
            />
            <TextField
              label="Mobile number"
              description="Philippine mobile, e.g. 09171234567. Never shown publicly."
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
            />
            <TextField
              label="City code"
              description="PSGC city code for your usual area."
              value={cityCode}
              onChangeText={setCityCode}
              keyboardType="number-pad"
            />
            <TextField
              label="Barangay code"
              description="Optional PSGC barangay code."
              value={barangayCode}
              onChangeText={setBarangayCode}
              keyboardType="number-pad"
            />
            <TextField
              label="About you"
              description="A short private note about yourself."
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
            />

            {profile?.tasker ? (
              <>
                <Text style={styles.sectionTitle}>Your public Tasker profile</Text>
                <Text style={styles.sectionHint}>
                  Clients see this on your offers. Your rating, completed jobs, and verification
                  status are set by Dizkarte and cannot be edited here.
                </Text>
                <TextField
                  label="Public bio"
                  value={publicBio}
                  onChangeText={setPublicBio}
                  multiline
                  numberOfLines={4}
                />
                <TextField
                  label="Experience"
                  value={publicExperience}
                  onChangeText={setPublicExperience}
                  multiline
                  numberOfLines={4}
                />

                <Text style={styles.fieldLabel}>Specialties</Text>
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
                        style={[styles.chip, selected ? styles.chipSelected : null]}
                      >
                        {selected ? (
                          <Icon name="check-circle" size={15} color={theme.onPrimary} />
                        ) : null}
                        <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                          {option.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View style={styles.actions}>
              <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => router.back()}
                fullWidth
              />
            </View>
          </ScrollView>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: theme.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  chipSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  chipTextSelected: {
    color: theme.onPrimary,
  },
  formError: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
    fontWeight: "600",
  },
  formSuccess: {
    color: theme.successOnSoft,
    backgroundColor: theme.successSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
});
