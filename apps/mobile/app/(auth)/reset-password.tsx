import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { passwordResetRequestSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { AuthBackButton } from "../../src/components/auth/AuthBackButton";
import { requestPasswordReset } from "../../src/services/auth";
import { theme, spacing, fontSize } from "../../src/theme";

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  /** Return to the sign-in screen, reusing the existing entry when possible. */
  function goBackToSignIn() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/sign-in");
    }
  }

  async function handleSubmit() {
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    await requestPasswordReset(parsed.data.email);
    setSubmitting(false);
    setSent(true);
  }

  return (
    <Screen>
      <AuthBackButton fallback="/(auth)/sign-in" accessibilityLabel="Back to sign in" />

      <View style={styles.centerContainer}>
        <View style={styles.formContent}>
          {sent ? (
            <>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.body}>
                If an account exists for {email}, we sent password reset instructions to that
                address. Follow the link in the email to choose a new password.
              </Text>
              <View style={styles.actions}>
                <Button label="Back to sign in" onPress={goBackToSignIn} fullWidth />
                <Button
                  label="Resend email"
                  onPress={handleSubmit}
                  loading={submitting}
                  variant="text"
                  fullWidth
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.body}>
                Enter your account email and we will send reset instructions.
              </Text>
              <TextField
                label="Email"
                required
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                error={fieldError}
              />
              <Button
                label="Send reset instructions"
                onPress={handleSubmit}
                loading={submitting}
                fullWidth
              />
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Remembered your password? </Text>
                <Pressable
                  onPress={goBackToSignIn}
                  accessibilityRole="link"
                  accessibilityLabel="Sign in"
                  hitSlop={6}
                >
                  <Text style={styles.footerLink}>Sign in</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    paddingHorizontal: spacing.md,
  },
  formContent: {
    width: "90%",
    maxWidth: 360,
    alignSelf: "center",
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
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
