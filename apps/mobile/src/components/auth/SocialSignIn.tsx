import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { signInWithProvider } from "../../services/auth";
import { theme, spacing, fontSize } from "../../theme";

/**
 * Approved social login, gated behind an explicit env flag. Social providers
 * are a Client/ops decision that also requires Supabase dashboard
 * configuration, so this renders nothing unless `EXPO_PUBLIC_AUTH_GOOGLE` is
 * turned on. Read directly from `process.env` (Expo inlines EXPO_PUBLIC_*
 * values) rather than the typed config schema, since it is optional/off by
 * default.
 */
const GOOGLE_ENABLED = process.env.EXPO_PUBLIC_AUTH_GOOGLE === "true";

export function SocialSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!GOOGLE_ENABLED) return null;

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const result = await signInWithProvider("google");
    setLoading(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        label="Continue with Google"
        onPress={handleGoogle}
        loading={loading}
        variant="secondary"
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  dividerText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  error: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: 8,
    fontWeight: "600",
    textAlign: "center",
  },
});
