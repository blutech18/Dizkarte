import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
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
import * as ImagePicker from "expo-image-picker";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { LocalityPicker } from "../../src/components/task/LocalityPicker";
import { Button } from "../../src/components/ui/Button";
import { LoadingState, ErrorState } from "../../src/components/ui/AsyncState";
import { Icon } from "../../src/components/ui/Icon";
import { CenterDialogModal } from "../../src/components/ui/CenterDialogModal";
import {
  ProfilePageIntro,
  ProfilePageSection,
} from "../../src/components/profile/ProfilePageSection";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { ScreenScrollProvider } from "../../src/providers/ScreenScrollContext";
import { uploadFile, createSignedUrl } from "../../src/services/storage/upload";
import type { MyProfileRecord, SpecialtyOption } from "../../src/services/marketplace";
import { theme, spacing, fontSize, radii, useResponsiveLayout } from "../../src/theme";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg"];

export default function EditProfileScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
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
    ref.current.measureLayout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scrollRef.current as unknown as any,
      (_x, y, _w, h) => {
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
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastScale = useRef(new Animated.Value(0.85)).current;
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const [formError, setFormError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [record, specialtyList] = await Promise.all([
        repository.getMyProfile(session.userId),
        repository.listSpecialtyOptions(),
      ]);
      if (!record) throw new Error("The signed-in user has no profile record.");
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

      if (record.avatarPath) {
        const url = await createSignedUrl("avatars", record.avatarPath);
        setAvatarUri(url);
      } else {
        setAvatarUri(null);
      }
    } catch {
      setLoadError("Your profile could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [repository, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickProfilePhoto() {
    if (!session || uploadingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Allow photo access in your device settings to upload a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    const mime = asset.mimeType?.toLowerCase() ?? "";
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      Alert.alert("Unsupported format", "Please select a PNG or JPG image for your profile photo.");
      return;
    }

    const previousUri = avatarUri;
    setUploadingAvatar(true);
    setAvatarUri(asset.uri);

    const uploaded = await uploadFile({
      bucket: "avatars",
      userId: session.userId,
      scopeId: "profile",
      file: {
        uri: asset.uri,
        fileName: asset.fileName ?? "avatar.jpg",
        mimeType: mime,
        sizeBytes: asset.fileSize ?? 0,
        kind: "image",
      },
    });

    if (!uploaded.ok) {
      setAvatarUri(previousUri);
      setUploadingAvatar(false);
      Alert.alert("Upload failed", uploaded.message);
      return;
    }

    const saveResult = await repository.updateMyProfile(session.userId, {
      avatarPath: uploaded.object.path,
    });
    setUploadingAvatar(false);
    if (!saveResult.ok) {
      setAvatarUri(previousUri);
      Alert.alert("Could not save photo", saveResult.message);
    } else {
      setProfile(saveResult.profile);
      notifyChanged();
    }
  }

  async function removeProfilePhoto() {
    if (!session || uploadingAvatar || !avatarUri) return;
    setUploadingAvatar(true);
    const previousUri = avatarUri;
    setAvatarUri(null);

    const saveResult = await repository.updateMyProfile(session.userId, {
      avatarPath: null,
    });
    setUploadingAvatar(false);
    if (!saveResult.ok) {
      setAvatarUri(previousUri);
      Alert.alert("Could not remove photo", saveResult.message);
    } else {
      setProfile(saveResult.profile);
      notifyChanged();
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    if (!profile) return false;
    const nameDiff = displayName.trim() !== (profile.displayName ?? "").trim();
    const mobileDiff = (mobile.trim().length > 0 ? mobile.trim() : "") !== (profile.mobile ?? "").trim();
    const cityDiff = (cityCode ? cityCode.trim() : "") !== (profile.cityCode ?? "").trim();
    const barangayDiff = (barangayCode ? barangayCode.trim() : "") !== (profile.barangayCode ?? "").trim();
    const bioDiff = bio.trim() !== (profile.bio ?? "").trim();

    let taskerDiff = false;
    if (profile.tasker) {
      const publicBioDiff = publicBio.trim() !== (profile.tasker.publicBio ?? "").trim();
      const publicExpDiff =
        publicExperience.trim() !== (profile.tasker.publicExperience ?? "").trim();
      const initialSpecs = (profile.tasker.specialties ?? []).map((s) => s.id).sort().join(",");
      const currentSpecs = [...selectedSpecialties].sort().join(",");
      const specDiff = initialSpecs !== currentSpecs;
      taskerDiff = publicBioDiff || publicExpDiff || specDiff;
    }

    return nameDiff || mobileDiff || cityDiff || barangayDiff || bioDiff || taskerDiff;
  }, [
    profile,
    displayName,
    mobile,
    cityCode,
    barangayCode,
    bio,
    publicBio,
    publicExperience,
    selectedSpecialties,
  ]);

  const promptDiscardChanges = useCallback(() => {
    Alert.alert(
      "Discard unsaved changes?",
      "You have unsaved changes to your profile. If you leave now, your edits will be discarded.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  }, []);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges) {
      promptDiscardChanges();
    } else {
      router.back();
    }
  }, [hasUnsavedChanges, promptDiscardChanges]);

  useEffect(() => {
    const backAction = () => {
      if (hasUnsavedChanges) {
        promptDiscardChanges();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [hasUnsavedChanges, promptDiscardChanges]);

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
        ...(mobile.trim() ? { mobile: mobile.trim() } : {}),
        ...(cityCode ? { cityCode } : {}),
        ...(barangayCode ? { barangayCode } : {}),
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

      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastAnim.setValue(0);
      toastScale.setValue(0.85);

      Animated.parallel([
        Animated.spring(toastScale, {
          toValue: 1,
          friction: 7,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(toastAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();

      toastTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastScale, {
            toValue: 0.9,
            duration: 240,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(toastAnim, {
            toValue: 0,
            duration: 240,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSaved(false);
        });
      }, 2500);
    } catch {
      setFormError("Could not save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Screen subPageTitle="Edit profile" onBack={handleBack} scroll={false} padded={false}>
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

              {/* Formal Identity & Avatar Hero Card */}
              <View style={styles.identityHeroCard}>
                {/* Left Side: Avatar Circle */}
                <View style={styles.avatarHeroWrapper}>
                  <Pressable
                    onPress={() => {
                      if (avatarUri) {
                        setShowPhotoModal(true);
                      } else {
                        void pickProfilePhoto();
                      }
                    }}
                    disabled={uploadingAvatar}
                    accessibilityRole="button"
                    accessibilityLabel={avatarUri ? "View profile photo" : "Upload profile photo"}
                    style={({ pressed }) => [
                      styles.avatarRing,
                      pressed && !uploadingAvatar
                        ? { opacity: 0.85, transform: [{ scale: 0.97 }] }
                        : null,
                    ]}
                  >
                    {avatarUri ? (
                      <Image
                        source={{ uri: avatarUri }}
                        style={styles.avatarHeroImage}
                        accessibilityLabel="Profile photo"
                      />
                    ) : (
                      <View style={styles.avatarHeroPlaceholder}>
                        <Text style={styles.avatarHeroInitials}>
                          {initials(displayName || session.displayName)}
                        </Text>
                      </View>
                    )}
                  </Pressable>

                  {/* Badge Action: If photo exists, it acts as Delete/Remove button; if no photo, Camera badge */}
                  {avatarUri ? (
                    <Pressable
                      onPress={() => void removeProfilePhoto()}
                      disabled={uploadingAvatar}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      style={({ pressed }) => [
                        styles.cameraActionBadge,
                        styles.deleteActionBadge,
                        pressed && !uploadingAvatar
                          ? { opacity: 0.8, transform: [{ scale: 0.9 }] }
                          : null,
                      ]}
                    >
                      <Icon name="trash" size={13} color={theme.errorSolid} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void pickProfilePhoto()}
                      disabled={uploadingAvatar}
                      accessibilityRole="button"
                      accessibilityLabel="Upload photo"
                      style={({ pressed }) => [
                        styles.cameraActionBadge,
                        pressed && !uploadingAvatar
                          ? { opacity: 0.8, transform: [{ scale: 0.9 }] }
                          : null,
                      ]}
                    >
                      {uploadingAvatar ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Icon name="camera" size={13} color={theme.primary} />
                      )}
                    </Pressable>
                  )}
                </View>

                {/* Right Side: Name on top, Single Action Button below */}
                <View style={styles.identityContentRight}>
                  <Text style={styles.identityName} numberOfLines={1}>
                    {displayName.trim() || session.displayName}
                  </Text>

                  {/* Actions Below Name */}
                  {uploadingAvatar ? (
                    <View style={styles.uploadingStatusRow}>
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                      <Text style={styles.uploadingStatusText}>Uploading photo…</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void pickProfilePhoto()}
                      accessibilityRole="button"
                      accessibilityLabel={avatarUri ? "Change photo" : "Upload photo"}
                      style={({ pressed }) => [
                        styles.actionPill,
                        pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
                      ]}
                    >
                      <Icon name="camera" size={13} color={theme.primary} />
                      <Text style={styles.actionPillText}>
                        {avatarUri ? "Change photo" : "Upload photo"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

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
                  onPress={handleBack}
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
                  disabled={saving || !hasUnsavedChanges || !displayName.trim()}
                  fullWidth
                />
              </View>
            </View>
          </Animated.View>

          {/* Full Profile Photo Viewer Modal */}
          <CenterDialogModal
            visible={showPhotoModal && Boolean(avatarUri)}
            onClose={() => setShowPhotoModal(false)}
          >
            <View style={styles.photoModalCard}>
              {/* Modal Header */}
              <View style={styles.photoModalHeader}>
                <Text style={styles.photoModalTitle}>Profile photo</Text>
                <Pressable
                  onPress={() => setShowPhotoModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close photo viewer"
                  style={({ pressed }) => [
                    styles.photoModalCloseBtn,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Icon name="close" size={18} color={theme.textPrimary} />
                </Pressable>
              </View>

              {/* Large Clean Photo View */}
              {avatarUri ? (
                <View style={styles.photoModalImageWrapper}>
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.photoModalImage}
                    resizeMode="cover"
                    accessibilityLabel="Full profile photo"
                  />
                </View>
              ) : null}

              {/* Modal Actions Footer */}
              <View style={styles.photoModalFooter}>
                <View style={styles.photoModalBtnCol}>
                  <Button
                    label="Change photo"
                    variant="secondary"
                    icon="camera"
                    onPress={() => {
                      setShowPhotoModal(false);
                      void pickProfilePhoto();
                    }}
                    disabled={uploadingAvatar}
                    fullWidth
                  />
                </View>
                <View style={styles.photoModalBtnCol}>
                  <Button
                    label="Remove photo"
                    variant="secondary"
                    icon="trash"
                    onPress={() => {
                      setShowPhotoModal(false);
                      void removeProfilePhoto();
                    }}
                    disabled={uploadingAvatar}
                    fullWidth
                  />
                </View>
              </View>
            </View>
          </CenterDialogModal>

          {/* Centered Popup Toast Notification */}
          {saved ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.centerToastContainer,
                {
                  opacity: toastAnim,
                  transform: [{ scale: toastScale }],
                },
              ]}
            >
              <View style={styles.centerToastCard}>
                <View style={styles.centerToastIconWrapper}>
                  <Icon name="check-circle" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.centerToastText}>Your profile has been updated.</Text>
              </View>
            </Animated.View>
          ) : null}
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
  centerToastContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  centerToastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.primary,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 28,
    gap: spacing.sm,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    maxWidth: "88%",
  },
  centerToastIconWrapper: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  centerToastText: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
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
  identityHeroCard: {
    backgroundColor: theme.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    elevation: 4,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  avatarHeroWrapper: {
    position: "relative",
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.45)",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  avatarHeroImage: {
    width: "100%",
    height: "100%",
  },
  avatarHeroPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.primaryPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHeroInitials: {
    color: theme.onPrimary,
    fontSize: fontSize.xl + 2,
    fontWeight: "800",
  },
  cameraActionBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  deleteActionBadge: {
    borderColor: "rgba(220, 38, 38, 0.35)",
  },
  identityContentRight: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  identityName: {
    fontSize: fontSize.lg + 1,
    fontWeight: "800",
    color: theme.onPrimary,
  },
  uploadingStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 4,
  },
  uploadingStatusText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.onPrimary,
  },
  actionPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: theme.surface,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  actionPillText: {
    fontSize: fontSize.xs + 1,
    fontWeight: "700",
    color: theme.primary,
  },
  photoModalCard: {
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    gap: spacing.md,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  photoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  photoModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalImageWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  photoModalImage: {
    width: "100%",
    height: "100%",
  },
  photoModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photoModalBtnCol: {
    flex: 1,
  },
});







