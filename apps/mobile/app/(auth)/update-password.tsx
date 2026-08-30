import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { passwordUpdateSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { AuthBackButton } from "../../src/components/auth/AuthBackButton";
import { AuthSuccessModal } from "../../src/components/auth/AuthSuccessModal";
import { updatePassword, signOut } from "../../src/services/auth";
import { theme, spacing, fontSize } from "../../src/theme";

export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  function handleProceed() {
    setShowSuccess(false);
    router.replace("/(tabs)/home");
  }

  async function handleCancel() {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  async function handleSubmit() {
    setFormError(null);
    const parsed = passwordUpdateSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const next: { password?: string; confirm?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "password") next.password = issue.message;
        if (issue.path[0] === "confirm") next.confirm = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const result = await updatePassword(parsed.data.password);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message ?? "Password update failed. Please try again.");
      return;
    }
    setShowSuccess(true);
  }

  return (
    <Screen>
      <AuthBackButton
        fallback="/(auth)/sign-in"
        onPress={handleCancel}
        accessibilityLabel="Cancel password reset"
      />
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

      <AuthSuccessModal
        visible={showSuccess}
        title="Password updated!"
        message="Redirecting to your dashboard..."
        onProceed={handleProceed}
      />
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
