import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, lineHeight } from "../../src/theme";

/**
 * Mobile-number step of the "Finish registration" gate.
 *
 * Captures and persists a Philippine mobile number. Live SMS one-time-code
 * verification requires an approved SMS provider (a provider-gated enhancement),
 * so this stores the confirmed number; the server re-validates the format.
 */
export default function RegistrationMobileScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signed-out") return <Redirect href="/(auth)/welcome" />;

  const handleSave = async () => {
    if (!session) return;
    setError(null);
    setSaving(true);
    try {
      const outcome = await repository.saveRegistrationMobile(session.userId, mobile);
      if (!outcome.ok) {
        setError(outcome.reason);
        return;
      }
      notifyChanged();
      if (router.canGoBack()) router.back();
      else router.replace("/finish-registration");
    } catch {
      setError("Could not save your mobile number. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={true} subPageTitle="Mobile number">
        <Text style={styles.title}>Enter your mobile number</Text>
        <Text style={styles.intro}>
          We use it to reach you about your offers and bookings. Philippine mobile numbers only.
        </Text>

        <TextField
          label="Mobile number"
          required
          value={mobile}
          onChangeText={(text) => {
            setMobile(text);
            if (error) setError(null);
          }}
          keyboardType="phone-pad"
          placeholder="0917 123 4567"
          maxLength={16}
          error={error ?? undefined}
        />

        <View style={styles.footer}>
          <Button
            label="Save mobile number"
            icon="check-circle"
            fullWidth
            loading={saving}
            disabled={saving || mobile.trim().length === 0}
            onPress={() => void handleSave()}
          />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.3,
  },
  intro: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  footer: { marginTop: spacing.xl },
});
