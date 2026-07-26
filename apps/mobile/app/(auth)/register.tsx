import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { registerSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { useSession } from "../../src/providers/SessionProvider";
import { resendConfirmation } from "../../src/services/auth";
import { SocialSignIn } from "../../src/components/auth/SocialSignIn";
import { theme, spacing, fontSize } from "../../src/theme";

type FieldErrors = { displayName?: string; email?: string; password?: string };

export default function RegisterScreen() {
  const { register } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    const parsed = registerSchema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "displayName") next.displayName = issue.message;
        if (key === "email") next.email = issue.message;
        if (key === "password") next.password = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const result = await register(parsed.data.email, parsed.data.password, parsed.data.displayName);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message ?? "Registration failed. Please try again.");
      return;
    }
    if (result.needsConfirmation) {
      setAwaitingConfirmation(true);
      return;
    }
    router.replace("/(tabs)/home");
  }

  async function handleResend() {
    setResending(true);
    await resendConfirmation(email);
    setResending(false);
    setResent(true);
  }

  if (awaitingConfirmation) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <View style={styles.formContent}>
            <Text style={styles.title}>Confirm your email</Text>
            <Text style={styles.subtitle}>
              We sent a confirmation link to {email}. Tap it to activate your account, then sign in.
            </Text>
            {resent ? (
              <Text style={styles.info} accessibilityLiveRegion="polite">
                Confirmation email sent again.
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Resend confirmation email"
                onPress={handleResend}
                loading={resending}
                variant="secondary"
                fullWidth
              />
              <Link href="/(auth)/sign-in" asChild>
                <Button label="Go to sign in" onPress={() => {}} fullWidth />
              </Link>
            </View>
          </View>
        </View>
      </Screen>
    );
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
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Sign up to post tasks or offer services on Dizkarte.</Text>

          {formError ? (
            <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}

          <TextField
            label="Full name"
            required
            value={displayName}
            onChangeText={setDisplayName}
            textContentType="name"
            error={fieldErrors.displayName}
          />
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
            description="At least 10 characters."
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            error={fieldErrors.password}
          />

          <Button label="Create account" onPress={handleSubmit} loading={submitting} fullWidth />

          <SocialSignIn />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/sign-in">
              <Text style={styles.footerLink}>Sign in</Text>
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
  info: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
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
