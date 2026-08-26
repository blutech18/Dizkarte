import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, lineHeight } from "../../src/theme";

/**
 * Billing-address step of the "Finish registration" gate.
 *
 * Used for account verification and receiving payments. Prefills any existing
 * address so the step is editable, not just add-once.
 */
export default function RegistrationBillingScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const existing = await repository.getBillingAddress(userId);
      if (existing) {
        setLine1(existing.line1);
        setLine2(existing.line2 ?? "");
        setCity(existing.city);
        setRegion(existing.region ?? "");
        setPostalCode(existing.postalCode ?? "");
      }
    } catch {
      // A failed prefill is non-fatal — the user can still enter the address.
    } finally {
      setLoading(false);
    }
  }, [repository, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "signed-out") return <Redirect href="/(auth)/welcome" />;

  const handleSave = async () => {
    if (!session) return;
    setError(null);
    if (line1.trim().length < 3) {
      setError("Enter your street address.");
      return;
    }
    if (city.trim().length < 2) {
      setError("Enter your city.");
      return;
    }
    setSaving(true);
    try {
      const outcome = await repository.saveBillingAddress(session.userId, {
        line1,
        line2: line2.trim() ? line2 : null,
        city,
        region: region.trim() ? region : null,
        postalCode: postalCode.trim() ? postalCode : null,
        country: "PH",
      });
      if (!outcome.ok) {
        setError(outcome.reason);
        return;
      }
      notifyChanged();
      if (router.canGoBack()) router.back();
      else router.replace("/finish-registration");
    } catch {
      setError("Could not save your billing address. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={true} subPageTitle="Billing address">
        <Text style={styles.title}>Add your billing address</Text>
        <Text style={styles.intro}>
          Used for account verification and receiving payments. It is never shown publicly.
        </Text>

        <TextField
          label="Street address"
          required
          value={line1}
          onChangeText={(text) => {
            setLine1(text);
            if (error) setError(null);
          }}
          autoCapitalize="words"
          placeholder="123 Rizal St"
          maxLength={200}
        />
        <TextField
          label="Apartment, suite, etc. (optional)"
          value={line2}
          onChangeText={setLine2}
          autoCapitalize="words"
          placeholder="Unit 4B"
          maxLength={200}
        />
        <TextField
          label="City"
          required
          value={city}
          onChangeText={(text) => {
            setCity(text);
            if (error) setError(null);
          }}
          autoCapitalize="words"
          placeholder="Quezon City"
          maxLength={120}
        />
        <TextField
          label="Region / Province (optional)"
          value={region}
          onChangeText={setRegion}
          autoCapitalize="words"
          placeholder="NCR"
          maxLength={120}
        />
        <TextField
          label="Postal code (optional)"
          value={postalCode}
          onChangeText={setPostalCode}
          keyboardType="number-pad"
          placeholder="1100"
          maxLength={20}
          error={error ?? undefined}
        />

        <View style={styles.footer}>
          <Button
            label="Save billing address"
            icon="check-circle"
            fullWidth
            loading={saving}
            disabled={saving || loading}
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
