import { Image, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { theme, spacing, fontSize } from "../../src/theme";

/**
 * Centered minimal welcome screen with clear brand logo, headline, and action controls.
 */
export default function WelcomeScreen() {
  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
            source={require("../../assets/text-icon-logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Dizkarte"
          />
          <Text style={styles.heroTitle}>Find trusted local help</Text>
          <Text style={styles.heroSubtitle}>
            Connect with verified Taskers near you for cleaning, repairs, deliveries, and everyday errands.
          </Text>
        </View>

        <View style={styles.actions}>
          <Link href="/(auth)/register" asChild>
            <Button label="Create an account" onPress={() => {}} fullWidth />
          </Link>
          <Link href="/(auth)/sign-in" asChild>
            <Button label="Sign in" onPress={() => {}} variant="secondary" fullWidth />
          </Link>
          <Text style={styles.termsCaption}>
            By continuing, you agree to Dizkarte&apos;s terms &amp; privacy policies.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
  },
  heroSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  logo: {
    width: 210,
    height: 62,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  termsCaption: {
    fontSize: fontSize.xs - 1,
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
