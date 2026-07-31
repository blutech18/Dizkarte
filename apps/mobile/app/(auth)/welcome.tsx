import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Button } from "../../src/components/ui/Button";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { theme, spacing, fontSize, lineHeight, radii } from "../../src/theme";

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
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
            source={require("../../assets/text-icon-logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Dizkarte"
          />
          <Text style={styles.heroTitle}>Get more done, {"\n"}the Dizkarte way</Text>
          <Text style={styles.heroSubtitle}>
            Post a task, get offers from trusted local Taskers, and pay safely when the job is done.
          </Text>
        </View>

        <View style={styles.categoryStrip}>
          {CATEGORY_STRIP.map((item) => (
            <View key={item.label} style={styles.categoryItem}>
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

        <View style={styles.valueSection}>
          {VALUE_PROPS.map((prop) => (
            <View key={prop.title} style={styles.valueRow}>
              <View style={styles.valueIcon}>
                <Icon name={prop.icon} size={22} color={theme.primary} />
              </View>
              <View style={styles.valueText}>
                <Text style={styles.valueTitle}>{prop.title}</Text>
                <Text style={styles.valueBody}>{prop.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTAs pinned below the scroll so the primary action is always reachable. */}
      <View style={styles.actions}>
        <Link href="/(auth)/register" asChild>
          <Button label="Get started" onPress={() => {}} fullWidth />
        </Link>
        <Link href="/(auth)/sign-in" asChild>
          <Button label="I already have an account" onPress={() => {}} variant="secondary" fullWidth />
        </Link>
        <Text style={styles.termsCaption}>
          By continuing, you agree to Dizkarte&apos;s terms &amp; privacy policies.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
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
  heroSubtitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    color: theme.textSecondary,
    maxWidth: 340,
  },
  categoryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.lg,
    marginBottom: spacing.xl,
  },
  categoryItem: {
    width: "31%",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryBubble: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: theme.surfaceSubtle,
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
    gap: spacing.lg,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  valueIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  valueText: {
    flex: 1,
    gap: spacing.xs,
  },
  valueTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  valueBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  actions: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  termsCaption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
