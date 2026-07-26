import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { profileUpdateSchema } from "@dizkarte/domain";
import { Screen } from "../src/components/ui/Screen";
import { TextField } from "../src/components/ui/TextField";
import { Button } from "../src/components/ui/Button";
import { useSession } from "../src/providers/SessionProvider";
import { theme, spacing, fontSize } from "../src/theme";

export default function SettingsScreen() {
  const { session } = useSession();
  const [displayName, setDisplayName] = useState(session?.displayName ?? "");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = profileUpdateSchema.safeParse({
      displayName,
      mobile: mobile.trim().length > 0 ? mobile : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSaving(false);
    setSaved(true);
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Profile & settings" }} />
      {saved ? (
        <Text style={styles.success} accessibilityRole="alert" accessibilityLiveRegion="polite">
          Your profile was updated.
        </Text>
      ) : null}
      <TextField
        label="Full name"
        value={displayName}
        onChangeText={setDisplayName}
        error={error}
      />
      <TextField
        label="Mobile number"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
        description="Philippine mobile number, e.g. 0917 123 4567"
      />
      <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth />
      <View style={{ height: spacing.lg }} />
      <Text style={styles.sectionTitle}>Language</Text>
      <Text style={styles.caption}>English / Filipino preference will be available here.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  success: {
    color: theme.successOnSoft,
    backgroundColor: theme.successSoft,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  caption: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
});
