import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { passwordSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { updatePassword } from "../../src/services/auth";
import { theme, spacing, fontSize } from "../../src/theme";

type FieldErrors = { password?: string; confirm?: string };

/**
 * Set-new-password screen reached after tapping the reset link in the
 * password-recovery email. Supabase has already established a temporary
 * recovery session; here we validate and commit the new password.
 */
export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    const parsed = passwordSchema.safeParse(password);
    const next: FieldErrors = {};
    if (!parsed.success) {
      next.password = parsed.error.issues[0]?.message ?? "Enter a valid password.";
    }
    if (password !== confirm) {
      next.confirm = "Passwords do not match.";
    }
    if (next.password || next.confirm) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    // The recovery session is now a normal authenticated session; the index
    // gate routes to the right place.
    router.replace("/");
  }

  return (
    <Screen>
      <View style={styles.centerContainer}>
        <View style={styles.formContent}>
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>

          {formError ? (
            <Text
              style={styles.formError}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {formError}
            </Text>
          ) : null}

          <TextField
            label="New password"
            required
            description="At least 10 characters."
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            error={fieldErrors.password}
          />
          <TextField
            label="Confirm password"
            required
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            error={fieldErrors.confirm}
          />

          <Button label="Update password" onPress={handleSubmit} loading={submitting} fullWidth />
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
});
