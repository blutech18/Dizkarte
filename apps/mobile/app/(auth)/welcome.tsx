import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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
/**
 * A decorative sample of the category art. Deliberately static, not the live
 * catalog: the visitor is signed out and the categories table is
 * authenticated-only, so fetching it here would 401. These illustrate the kind
 * of work the marketplace covers; the real, current catalog appears once the
 * user is in.
 */
const CATEGORY_STRIP: ReadonlyArray<{ readonly art: ImageSourcePropType; readonly label: string }> =
  [
    { art: require("../../assets/icons/cleaning.png"), label: "Cleaning" },
    { art: require("../../assets/icons/repairs-installations.png"), label: "Repairs" },
    { art: require("../../assets/icons/furniture-assembly.png"), label: "Assembly" },
    { art: require("../../assets/icons/removals.png"), label: "Removals" },
    { art: require("../../assets/icons/painting.png"), label: "Painting" },
    { art: require("../../assets/icons/gardening.png"), label: "Gardening" },
  ];
/* eslint-enable @typescript-eslint/no-require-imports */

const VALUE_PROPS: ReadonlyArray<{
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}> = [
  {
    icon: "shield",
    title: "Verified Taskers",
    body: "Every Tasker passes manual identity review before they can offer on your task.",
  },
  {
    icon: "wallet",
    title: "Protected payments",
    body: "Your payment is held securely and only released once you confirm the work is done.",
  },
  {
    icon: "star",
    title: "Rated by locals",
    body: "Choose with confidence using honest reviews from other people in your area.",
  },
];

/**
 * Airtasker-style landing.
 *
 * A tall, scrollable hero rather than a centred card: a bold headline and the
 * primary action up top, an at-a-glance strip of what the marketplace does, and
 * the reasons to trust it below. Roomy by design, matching the product direction.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { gutter, contentWidth, isTablet } = useResponsiveLayout();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [fadeAnim, translateYAnim]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: translateYAnim }],
        }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.mainContent, { maxWidth: Math.min(contentWidth, 600) }]}>
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
                Get more done, {"\n"}the Dizkarte way
              </Text>
              <Text style={[styles.heroSubtitle, isTablet ? styles.heroSubtitleTablet : null]}>
                Post a task, get offers from trusted local Taskers, and pay safely when the job is
                done.
              </Text>
            </View>

            <View style={[styles.categoryStrip, isTablet ? styles.categoryStripTablet : null]}>
              {CATEGORY_STRIP.map((item) => (
                <View
                  key={item.label}
                  style={[styles.categoryItem, isTablet ? styles.categoryItemTablet : null]}
                >
                  <View style={styles.categoryBubble}>
                    <Image
                      source={item.art}
                      style={styles.categoryArt}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                  <Text style={styles.categoryLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.valueSection, isTablet ? styles.valueSectionTablet : null]}>
              {VALUE_PROPS.map((prop) => (
                <View key={prop.title} style={[styles.valueRow, isTablet ? styles.valueRowTablet : null]}>
                  <View style={styles.valueIconBubble}>
                    <Icon name={prop.icon} size={22} color={theme.primary} />
                  </View>
                  <View style={[styles.valueText, isTablet ? styles.valueTextTablet : null]}>
                    <Text style={[styles.valueTitle, isTablet ? styles.valueTitleTablet : null]}>{prop.title}</Text>
                    <Text style={[styles.valueBody, isTablet ? styles.valueBodyTablet : null]}>{prop.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* CTAs pinned below the scroll with seamless safe-area footer styling */}
        <View
          style={[
            styles.actions,
            isTablet ? styles.actionsTablet : null,
            {
              paddingHorizontal: gutter,
              paddingBottom: isTablet ? spacing.lg : (insets.bottom > 0 ? Math.min(insets.bottom, 14) : 12),
            },
          ]}
        >
          {/* Seamless gradient fade mask above footer */}
          <View style={styles.fadeMask} pointerEvents="none">
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="footerFadeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={theme.surface} stopOpacity="0" />
                  <Stop offset="100%" stopColor={theme.surface} stopOpacity="1" />
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
            <Text style={[styles.termsCaption, isTablet ? styles.termsCaptionTablet : null]}>
              By continuing, you agree to Dizkarte&apos;s terms &amp; privacy policies.
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    paddingTop: spacing.xl,
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
    width: 180,
    height: 52,
    marginBottom: spacing.xl,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.6,
    marginBottom: spacing.md,
  },
  heroTitleTablet: {
    fontSize: 42,
    lineHeight: 48,
  },
  heroSubtitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    color: theme.textSecondary,
    maxWidth: 360,
  },
  heroSubtitleTablet: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    maxWidth: 480,
  },
  categoryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.lg,
    marginBottom: spacing.xl,
  },
  categoryStripTablet: {
    justifyContent: "space-between",
  },
  categoryItem: {
    width: "31%",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryItemTablet: {
    width: "15%",
  },
  categoryBubble: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
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
  valueSection: {
    gap: spacing.md,
  },
  valueSectionTablet: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  valueRowTablet: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    padding: spacing.lg,
  },
  valueIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  valueText: {
    flex: 1,
    gap: spacing.xs,
  },
  valueTextTablet: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  valueTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  valueTitleTablet: {
    textAlign: "center",
  },
  valueBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  valueBodyTablet: {
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
    backgroundColor: theme.surface,
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
    gap: spacing.md,
  },
  actionsInnerTablet: {
    gap: spacing.md,
  },
  actionButtons: {
    width: "100%",
    gap: spacing.md,
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
  termsCaption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "center",
  },
});
