import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import Constants from "expo-constants";
import { profileUpdateSchema, passwordSchema } from "@dizkarte/domain";
import { Screen } from "../src/components/ui/Screen";
import { TextField } from "../src/components/ui/TextField";
import { Button } from "../src/components/ui/Button";
import { Icon } from "../src/components/ui/Icon";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { ProfilePageIntro, ProfilePageSection } from "../src/components/profile/ProfilePageSection";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import { updatePassword } from "../src/services/auth";
import type { MyProfileRecord } from "../src/services/marketplace";
import { getAppConfig } from "../src/lib/config";
import { theme, spacing, fontSize, radii, lineHeight, useResponsiveLayout } from "../src/theme";

type Language = "en" | "fil";

const LANGUAGE_OPTIONS: ReadonlyArray<{ key: Language; label: string; native: string }> = [
  { key: "en", label: "English", native: "English" },
  { key: "fil", label: "Filipino", native: "Filipino" },
];

type LoadState = "loading" | "loaded" | "error";

/** App version and environment are read from the build, never hard-coded. */
const APP_VERSION = Constants.expoConfig?.version ?? "—";
function environmentLabel(): string {
  try {
    const env = getAppConfig().environment;
    return env.charAt(0).toUpperCase() + env.slice(1);
  } catch {
    return "Unknown";
  }
}

type Completeness = { readonly pct: number; readonly missing: ReadonlyArray<string> };

/** Share of the profile fields a user can fill in that are actually populated. */
function computeCompleteness(profile: MyProfileRecord): Completeness {
  const checks: ReadonlyArray<{ label: string; done: boolean }> = [
    { label: "full name", done: profile.displayName.trim().length > 0 },
    { label: "mobile number", done: (profile.mobile ?? "").trim().length > 0 },
    { label: "city", done: (profile.cityCode ?? "").trim().length > 0 },
    { label: "about you", done: profile.bio.trim().length > 0 },
    { label: "profile photo", done: profile.avatarPath !== null },
    ...(profile.tasker
      ? [
          { label: "public bio", done: profile.tasker.publicBio.trim().length > 0 },
          { label: "specialties", done: profile.tasker.specialtyIds.length > 0 },
        ]
      : []),
  ];
  const done = checks.filter((check) => check.done).length;
  return {
    pct: Math.round((done / checks.length) * 100),
    missing: checks.filter((check) => !check.done).map((check) => check.label),
  };
}

export default function SettingsScreen() {
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { isTablet } = useResponsiveLayout();

  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<MyProfileRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [mobile, setMobile] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const isProfileDirty = useMemo(() => {
    if (!profile) return false;
    const currentName = displayName.trim();
    const origName = profile.displayName.trim();
    const currentMobile = mobile.trim();
    const origMobile = (profile.mobile ?? "").trim();
    return currentName !== origName || currentMobile !== origMobile;
  }, [profile, displayName, mobile]);

  const isPasswordDirty = useMemo(() => {
    return newPassword.length > 0 || confirmPassword.length > 0;
  }, [newPassword, confirmPassword]);

  // Smooth animation for Profile Details action buttons
  const profileActionAnim = useRef(new Animated.Value(0)).current;
  const [profileActionMounted, setProfileActionMounted] = useState(false);

  useEffect(() => {
    const isDirty = isProfileDirty || saving;
    if (isDirty) {
      setProfileActionMounted(true);
      Animated.timing(profileActionAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(profileActionAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setProfileActionMounted(false);
        }
      });
    }
  }, [isProfileDirty, saving, profileActionAnim]);

  const handleCancelProfile = useCallback(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setMobile(profile.mobile ?? "");
    setError(undefined);
  }, [profile]);

  // Smooth animation for Password action buttons
  const passwordActionAnim = useRef(new Animated.Value(0)).current;
  const [passwordActionMounted, setPasswordActionMounted] = useState(false);

  useEffect(() => {
    const isDirty = isPasswordDirty || passwordSaving;
    if (isDirty) {
      setPasswordActionMounted(true);
      Animated.timing(passwordActionAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(passwordActionAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setPasswordActionMounted(false);
        }
      });
    }
  }, [isPasswordDirty, passwordSaving, passwordActionAnim]);

  const handleCancelPassword = useCallback(() => {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage(null);
  }, []);

  const userId = session?.userId ?? null;

  const load = useCallback(() => {
    if (!userId) return;
    setState("loading");
    repository
      .getMyProfile(userId)
      .then((record) => {
        if (!record) {
          setState("error");
          return;
        }
        setProfile(record);
        setDisplayName(record.displayName);
        setMobile(record.mobile ?? "");
        setLanguage(record.language);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!userId) return;
    const parsed = profileUpdateSchema.safeParse({
      displayName,
      mobile: mobile.trim().length > 0 ? mobile : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const result = await repository.updateMyProfile(userId, {
        displayName,
        ...(mobile.trim().length > 0 ? { mobile } : {}),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Reflect any server-side normalization (e.g. the +63 mobile form).
      setProfile(result.profile);
      setDisplayName(result.profile.displayName);
      setMobile(result.profile.mobile ?? "");
      setSaved(true);
      notifyChanged();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Could not save your settings. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [userId, displayName, mobile, repository, notifyChanged]);

  const handleSelectLanguage = useCallback(
    async (next: Language) => {
      if (!userId || next === language || languageSaving) return;
      const previous = language;
      setLanguage(next);
      setLanguageSaving(true);
      setError(undefined);
      try {
        const result = await repository.updateMyProfile(userId, { language: next });
        if (!result.ok) {
          setLanguage(previous);
          setError(result.message);
          return;
        }
        notifyChanged();
      } catch {
        setLanguage(previous);
        setError("Could not save your language preference. Check your connection and try again.");
      } finally {
        setLanguageSaving(false);
      }
    },
    [userId, language, languageSaving, repository, notifyChanged],
  );

  const handleChangePassword = useCallback(async () => {
    setPasswordMessage(null);
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordMessage({
        ok: false,
        text: parsed.error.issues[0]?.message ?? "Enter a valid password.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ ok: false, text: "The two passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.ok) {
        setPasswordMessage({ ok: false, text: result.message });
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ ok: true, text: "Your password has been updated." });
    } catch {
      setPasswordMessage({
        ok: false,
        text: "Could not update your password. Check your connection and try again.",
      });
    } finally {
      setPasswordSaving(false);
    }
  }, [newPassword, confirmPassword]);

  const completeness = profile ? computeCompleteness(profile) : null;

  if (!session) {
    return (
      <Screen scroll={true} subPageTitle="General settings">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState title="Sign in" description="Sign in to manage your settings." />
      </Screen>
    );
  }

  return (
    <Screen scroll={true} subPageTitle="General settings">
      <Stack.Screen options={{ headerShown: false }} />

      {state === "loading" ? <LoadingState label="Loading your settings" /> : null}
      {state === "error" ? <ErrorState title="Could not load settings" onRetry={load} /> : null}

      {state === "loaded" ? (
        <View style={styles.content}>
          <ProfilePageIntro
            title="Manage your settings"
            description="Update account details, language, sign-in security, and app information."
          />

          {/* Success Toast */}
          {saved ? (
            <View style={styles.successBanner}>
              <Icon name="check-circle" size={18} color={theme.successOnSoft} />
              <Text style={styles.successText}>Your settings have been saved.</Text>
            </View>
          ) : null}

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle" size={18} color={theme.errorOnSoft} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Section 0: Profile completeness */}
          {completeness ? (
            <ProfilePageSection
              icon="check-circle"
              title="Profile completeness"
              description="Complete your account to build trust and unlock the best marketplace experience."
              trailing={<Text style={styles.completePct}>{completeness.pct}%</Text>}
            >
              <View style={styles.completenessContent}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${completeness.pct}%` }]} />
                </View>
                {completeness.missing.length > 0 ? (
                  <View style={styles.completenessActionGroup}>
                    <Text style={styles.sectionHint}>
                      Add your {completeness.missing.join(", ")} to complete your profile.
                    </Text>
                    <Button
                      label="Complete your profile"
                      variant="secondary"
                      icon="user"
                      onPress={() => router.push("/profile/edit")}
                      fullWidth
                    />
                  </View>
                ) : (
                  <Text style={styles.sectionHint}>Your profile is complete — nice work!</Text>
                )}
              </View>
            </ProfilePageSection>
          ) : null}

          <View style={[styles.settingsGrid, isTablet ? styles.settingsGridTablet : null]}>
            {/* Section 1: Profile Details */}
            <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
              <ProfilePageSection
                icon="user"
                title="Profile details"
                description="Your private account name, email, and mobile number."
              >
                <TextField
                  label="Email"
                  value={session?.email ?? ""}
                  editable={false}
                  textContentType="emailAddress"
                />
                <TextField
                  label="Full name"
                  value={displayName}
                  onChangeText={(text) => {
                    setDisplayName(text);
                    setSaved(false);
                  }}
                  textContentType="name"
                />
                <TextField
                  label="Mobile number"
                  value={mobile}
                  onChangeText={(text) => {
                    setMobile(text);
                    setSaved(false);
                  }}
                  keyboardType="phone-pad"
                  description="Philippine mobile number, e.g. 0917 123 4567"
                  containerStyle={styles.lastFieldNoMargin}
                />
                {profileActionMounted ? (
                  <Animated.View
                    style={[
                      styles.animatedButtonGroup,
                      {
                        opacity: profileActionAnim,
                        maxHeight: profileActionAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 60],
                        }),
                        marginTop: profileActionAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, spacing.md],
                        }),
                        transform: [
                          {
                            translateY: profileActionAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [8, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.buttonRow}>
                      <View style={styles.buttonCol}>
                        <Button
                          label="Cancel"
                          variant="secondary"
                          onPress={handleCancelProfile}
                          disabled={saving}
                          fullWidth
                        />
                      </View>
                      <View style={styles.buttonCol}>
                        <Button
                          label={saving ? "Saving…" : "Save changes"}
                          onPress={() => void handleSave()}
                          loading={saving}
                          fullWidth
                        />
                      </View>
                    </View>
                  </Animated.View>
                ) : null}
              </ProfilePageSection>
            </View>

            {/* Section 2: Language Preference */}
            <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
              <ProfilePageSection
                icon="globe"
                title="Language"
                description="Choose your preferred language for the app interface."
                showDivider={false}
              >
                <View style={styles.languageRow}>
                  {LANGUAGE_OPTIONS.map((option) => {
                    const selected = language === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => void handleSelectLanguage(option.key)}
                        disabled={languageSaving}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: languageSaving }}
                        accessibilityLabel={`${option.label} language`}
                        style={({ pressed }) => [
                          styles.languagePill,
                          selected ? styles.languagePillSelected : null,
                          pressed ? { opacity: 0.85, transform: [{ scale: 0.97 }] } : null,
                        ]}
                      >
                        <Icon
                          name={selected ? "check-circle" : "globe"}
                          size={16}
                          color={selected ? theme.onPrimary : theme.textSecondary}
                        />
                        <View style={styles.languagePillTextGroup}>
                          <Text
                            style={[
                              styles.languagePillLabel,
                              selected ? styles.languagePillLabelSelected : null,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={[
                              styles.languagePillNative,
                              selected ? styles.languagePillNativeSelected : null,
                            ]}
                          >
                            {option.native}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ProfilePageSection>
            </View>

            {/* Section 3: App Info */}
            <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
              <ProfilePageSection
                icon="note"
                title="App information"
                description="Build and account identifiers used for support."
              >
                <View style={styles.infoGroup}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Version</Text>
                    <Text style={styles.infoValue}>{APP_VERSION}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Environment</Text>
                    <StatusBadge tone="neutral" label={environmentLabel()} />
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Account ID</Text>
                    <Text style={styles.infoValueMono} numberOfLines={1}>
                      {session?.userId ? `${session.userId.slice(0, 8)}…` : "—"}
                    </Text>
                  </View>
                </View>
              </ProfilePageSection>
            </View>

            {/* Section 4: Password */}
            <View style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}>
              <ProfilePageSection
                icon="lock"
                title="Password"
                description="Set a new password for signing in."
              >
                {passwordMessage ? (
                  <View style={passwordMessage.ok ? styles.successBanner : styles.errorBanner}>
                    <Icon
                      name={passwordMessage.ok ? "check-circle" : "alert-circle"}
                      size={16}
                      color={passwordMessage.ok ? theme.successOnSoft : theme.errorOnSoft}
                    />
                    <Text style={passwordMessage.ok ? styles.successText : styles.errorText}>
                      {passwordMessage.text}
                    </Text>
                  </View>
                ) : null}
                <TextField
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  textContentType="newPassword"
                  description="At least 10 characters."
                />
                <TextField
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  textContentType="newPassword"
                  containerStyle={styles.lastFieldNoMargin}
                />
                {passwordActionMounted ? (
                  <Animated.View
                    style={[
                      styles.animatedButtonGroup,
                      {
                        opacity: passwordActionAnim,
                        maxHeight: passwordActionAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 60],
                        }),
                        marginTop: passwordActionAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, spacing.md],
                        }),
                        transform: [
                          {
                            translateY: passwordActionAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [8, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.buttonRow}>
                      <View style={styles.buttonCol}>
                        <Button
                          label="Cancel"
                          variant="secondary"
                          onPress={handleCancelPassword}
                          disabled={passwordSaving}
                          fullWidth
                        />
                      </View>
                      <View style={styles.buttonCol}>
                        <Button
                          label={passwordSaving ? "Updating…" : "Update password"}
                          onPress={() => void handleChangePassword()}
                          loading={passwordSaving}
                          fullWidth
                        />
                      </View>
                    </View>
                  </Animated.View>
                ) : null}
              </ProfilePageSection>
            </View>
          </View>

          {/* Section 5: Danger Zone */}
          <ProfilePageSection
            icon="alert-circle"
            title="Account deactivation"
            description="Deactivation is handled by support so active tasks and bookings can be closed safely. We will follow up through Notifications."
            tone="danger"
            showDivider={false}
          >
            <Button
              label="Request account deactivation"
              variant="secondary"
              icon="alert-circle"
              onPress={() => router.push("/support")}
              fullWidth
            />
          </ProfilePageSection>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  settingsGrid: {
    gap: spacing.md,
  },
  settingsGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridItem: {
    minWidth: 0,
  },
  gridItemTablet: {
    flexGrow: 1,
    flexBasis: 320,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.successSoft,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  successText: {
    color: theme.successOnSoft,
    fontSize: fontSize.sm,
    fontWeight: "600",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  errorText: {
    color: theme.errorOnSoft,
    fontSize: fontSize.sm,
    fontWeight: "600",
    flex: 1,
  },
  completenessContent: {
    gap: spacing.md,
  },
  completenessActionGroup: {
    gap: spacing.md,
  },
  sectionHint: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: lineHeight.sm,
  },
  completePct: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.primary,
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: theme.primary,
  },
  languageRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  languagePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  languagePillSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  languagePillTextGroup: {
    gap: 2,
  },
  languagePillLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  languagePillLabelSelected: {
    color: theme.onPrimary,
  },
  languagePillNative: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  languagePillNativeSelected: {
    color: theme.onPrimary,
    opacity: 0.8,
  },
  infoGroup: {
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: "600",
  },
  infoValueMono: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: "600",
    fontFamily: "monospace",
    maxWidth: "50%" as unknown as number,
  },
  lastFieldNoMargin: {
    marginBottom: 0,
  },
  animatedButtonGroup: {
    overflow: "hidden",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  buttonCol: {
    flex: 1,
  },
});
