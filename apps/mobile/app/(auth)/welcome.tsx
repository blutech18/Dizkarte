import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { Button } from "../../src/components/ui/Button";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  useResponsiveLayout,
} from "../../src/theme";

/* eslint-disable @typescript-eslint/no-require-imports -- static asset requires are standard RN */
const CATEGORIES: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly art: ImageSourcePropType;
}> = [
  {
    id: "cleaning",
    label: "Cleaning",
    art: require("../../assets/icons/cleaning.png"),
  },
  {
    id: "repairs",
    label: "Repairs",
    art: require("../../assets/icons/repairs-installations.png"),
  },
  {
    id: "assembly",
    label: "Assembly",
    art: require("../../assets/icons/furniture-assembly.png"),
  },
  {
    id: "removals",
    label: "Removals",
    art: require("../../assets/icons/removals.png"),
  },
  {
    id: "painting",
    label: "Painting",
    art: require("../../assets/icons/painting.png"),
  },
  {
    id: "gardening",
    label: "Gardening",
    art: require("../../assets/icons/gardening.png"),
  },
];

const TRUST_BADGES: ReadonlyArray<{
  readonly icon: IconName;
  readonly label: string;
}> = [
  {
    icon: "shield",
    label: "Verified",
  },
  {
    icon: "wallet",
    label: "Protected",
  },
  {
    icon: "star",
    label: "Rated",
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { gutter, contentWidth, isTablet } = useResponsiveLayout();

  // Opening animation states
  const [splashFinished, setSplashFinished] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashLogoScale = useRef(new Animated.Value(0.9)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashRingScale = useRef(new Animated.Value(0.9)).current;
  const splashRingOpacity = useRef(new Animated.Value(0.6)).current;

  // Content entrance
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    // 1. Splash logo pop
    Animated.parallel([
      Animated.timing(splashLogoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(splashLogoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(splashRingScale, {
        toValue: 1.35,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(splashRingOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    const timer = setTimeout(() => {
      handleDismissSplash();
    }, 850);

    return () => clearTimeout(timer);
  }, []);

  function handleDismissSplash() {
    Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      setSplashFinished(true);
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Minimalist Landing Page Content */}
      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: contentFade,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.mainContent, { maxWidth: Math.min(contentWidth, 600) }]}>
            {/* HERO BRAND HEADER */}
            <View style={styles.hero}>
              <Image
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
                source={require("../../assets/text-icon-logo.png")}
                style={styles.logo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityLabel="Dizkarte"
              />

              <Text style={[styles.heroTitle, isTablet ? styles.heroTitleTablet : null]}>
                Get more done,{"\n"}the Dizkarte way
              </Text>
            </View>

            {/* CATEGORY STRIP */}
            <View style={styles.categorySection}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Popular services
                </Text>
              </View>

              <View style={[styles.categoryStrip, isTablet ? styles.categoryStripTablet : null]}>
                {CATEGORIES.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.categoryItem,
                      isTablet ? styles.categoryItemTablet : null,
                      pressed ? styles.categoryItemPressed : null,
                    ]}
                    onPress={() => router.push("/(auth)/register")}
                    accessibilityRole="button"
                    accessibilityLabel={`Explore ${item.label}`}
                  >
                    <View style={styles.categoryBubble}>
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Svg height="100%" width="100%">
                          <Defs>
                            <LinearGradient
                              id={`catGrad-${item.id}`}
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="100%"
                            >
                              <Stop offset="0%" stopColor="#DDD6FE" stopOpacity="1" />
                              <Stop offset="50%" stopColor="#EDE9FE" stopOpacity="1" />
                              <Stop offset="100%" stopColor="#FAF5FF" stopOpacity="1" />
                            </LinearGradient>
                          </Defs>
                          <Rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            rx={radii.lg}
                            fill={`url(#catGrad-${item.id})`}
                          />
                        </Svg>
                      </View>
                      <Image
                        source={item.art}
                        style={styles.categoryArt}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    </View>
                    <Text style={styles.categoryLabel}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* TRUST BADGES (MAXIMIZED ICONS, 1-WORD LABELS, NO CONTAINER) */}
            <View style={styles.trustBadgesRow}>
              {TRUST_BADGES.map((badge) => (
                <View key={badge.label} style={styles.trustBadgeItem}>
                  <Icon name={badge.icon} size={28} color={theme.primary} />
                  <Text style={styles.trustBadgeLabel}>{badge.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* STICKY ACTION FOOTER */}
        <View
          style={[
            styles.actions,
            isTablet ? styles.actionsTablet : null,
            {
              paddingHorizontal: gutter,
              paddingBottom: isTablet
                ? spacing.lg
                : insets.bottom > 0
                ? Math.min(insets.bottom, 16)
                : 12,
            },
          ]}
        >
          {/* Seamless gradient fade mask above footer */}
          <View style={styles.fadeMask} pointerEvents="none">
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="footerFadeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={theme.background} stopOpacity="0" />
                  <Stop offset="100%" stopColor={theme.background} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#footerFadeGradient)" />
            </Svg>
          </View>

          <View
            style={[
              styles.actionsInner,
              isTablet ? styles.actionsInnerTablet : null,
              { maxWidth: Math.min(contentWidth, 600) },
            ]}
          >
            <View style={[styles.actionButtons, isTablet ? styles.actionButtonsTablet : null]}>
              <View style={isTablet ? styles.actionButtonCol : styles.fullWidth}>
                <Button
                  label="Get started"
                  onPress={() => router.push("/(auth)/register")}
                  icon="arrow-right"
                  fullWidth
                />
              </View>
              <View style={isTablet ? styles.actionButtonCol : styles.fullWidth}>
                <Button
                  label="I already have an account"
                  onPress={() => router.push("/(auth)/sign-in")}
                  variant="secondary"
                  fullWidth
                />
              </View>
            </View>
            <View style={styles.footerTrustRow}>
              <Icon name="lock" size={13} color={theme.textSecondary} />
              <Text style={styles.termsCaption}>
                Secure escrow guarantee • Verified marketplace policies
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* INTRO BRAND OPENING ANIMATION OVERLAY */}
      {!splashFinished && (
        <Animated.View
          style={[
            styles.splashOverlay,
            {
              opacity: splashOpacity,
            },
          ]}
          onTouchStart={handleDismissSplash}
        >
          {/* Subtle Ambient Gradient Background */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="splashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#7C3AED" />
                  <Stop offset="50%" stopColor="#6E20DF" />
                  <Stop offset="100%" stopColor="#300F6B" />
                </LinearGradient>
                <RadialGradient id="splashOrb" cx="50%" cy="40%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#FDBE17" stopOpacity="0.28" />
                  <Stop offset="100%" stopColor="#6E20DF" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashGradient)" />
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashOrb)" />
            </Svg>
          </View>

          {/* Soft Concentric Aura Ring */}
          <Animated.View
            style={[
              styles.splashRing,
              {
                opacity: splashRingOpacity,
                transform: [{ scale: splashRingScale }],
              },
            ]}
          />

          {/* Logo Identity */}
          <Animated.View
            style={[
              styles.splashContent,
              {
                opacity: splashLogoOpacity,
                transform: [{ scale: splashLogoScale }],
              },
            ]}
          >
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
              source={require("../../assets/text-icon-white.png")}
              style={styles.splashLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel="Dizkarte"
            />
            <Text style={styles.splashTagline}>Your local task community</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.background,
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  mainContent: {
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    marginBottom: spacing.xl,
  },
  logo: {
    width: 170,
    height: 48,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.6,
    marginBottom: spacing.sm,
  },
  heroTitleTablet: {
    fontSize: 42,
    lineHeight: 48,
  },
  sectionHeading: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.2,
  },
  categorySection: {
    marginBottom: spacing.xl,
  },
  categoryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.md,
  },
  categoryStripTablet: {
    justifyContent: "space-between",
  },
  categoryItem: {
    width: "31%",
    alignItems: "center",
    gap: spacing.xs,
  },
  categoryItemTablet: {
    width: "15%",
  },
  categoryItemPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  categoryBubble: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C4B5FD",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6E20DF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryArt: {
    width: "56%",
    height: "56%",
  },
  categoryLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    textAlign: "center",
  },
  trustBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  trustBadgeItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  trustBadgeLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textAlign: "center",
  },
  fadeMask: {
    position: "absolute",
    top: -24,
    left: 0,
    right: 0,
    height: 24,
  },
  actions: {
    paddingTop: spacing.md,
    backgroundColor: theme.background,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 8,
  },
  actionsTablet: {
    paddingTop: spacing.lg,
  },
  actionsInner: {
    width: "100%",
    alignSelf: "center",
    gap: spacing.sm,
  },
  actionsInnerTablet: {
    gap: spacing.md,
  },
  actionButtons: {
    width: "100%",
    gap: spacing.sm,
  },
  actionButtonsTablet: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  actionButtonCol: {
    flex: 1,
  },
  fullWidth: {
    width: "100%",
  },
  footerTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
  },
  termsCaption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "center",
  },

  /* SPLASH OVERLAY */
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  splashRing: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: "rgba(253, 190, 23, 0.35)",
    backgroundColor: "rgba(253, 190, 23, 0.05)",
  },
  splashContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  splashLogo: {
    width: 200,
    height: 56,
  },
  splashTagline: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: fontSize.md,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});


