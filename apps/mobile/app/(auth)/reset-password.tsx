import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { passwordResetRequestSchema } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { requestPasswordReset } from "../../src/services/auth";
import { theme, spacing, fontSize } from "../../src/theme";

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

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

  if (sent) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <View style={styles.formContent}>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.body}>
              If an account exists for {email}, we sent instructions to reset your password.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.centerContainer}>
        <View style={styles.formContent}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.body}>Enter your account email and we will send reset instructions.</Text>
          <TextField
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            error={fieldError}
          />
          <Button
            label="Send reset instructions"
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
          />
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
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
});
