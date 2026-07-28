import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { signInSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { useSession } from "../../src/providers/SessionProvider";
import { SocialSignIn } from "../../src/components/auth/SocialSignIn";
import { theme, spacing, fontSize } from "../../src/theme";

export default function SignInScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") next.email = issue.message;
        if (issue.path[0] === "password") next.password = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const result = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message ?? "Sign-in failed. Please try again.");
      return;
    }
    router.replace("/(tabs)/home");
  }

  return (
    <Screen>
      <View style={styles.centerContainer}>
        <View style={styles.formContent}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require is standard RN
            source={require("../../assets/text-icon-logo.png")}
            style={styles.brandWordmark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Dizkarte"
          />
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Welcome back! Sign in to continue to Dizkarte.</Text>

          {formError ? (
            <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}

          <TextField
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            error={fieldErrors.email}
          />
          <TextField
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            error={fieldErrors.password}
          />
          <View style={styles.actions}>
            <Button label="Sign in" onPress={handleSubmit} loading={submitting} fullWidth />
            <Link href="/(auth)/reset-password" asChild>
              <Button label="Forgot password?" onPress={() => {}} variant="text" fullWidth />
            </Link>
          </View>
          <SocialSignIn />
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Link href="/(auth)/register">
              <Text style={styles.footerLink}>Create account</Text>
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  formContent: {
    width: "90%",
    maxWidth: 360,
    alignSelf: "center",
  },
  brandWordmark: {
    width: "65%",
    maxWidth: 240,
    height: 72,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  formError: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    fontWeight: "600",
    textAlign: "center",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  footerLink: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.primary,
  },
});
