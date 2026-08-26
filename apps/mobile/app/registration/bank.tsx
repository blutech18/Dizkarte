import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { Button } from "../../src/components/ui/Button";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, lineHeight, radii } from "../../src/theme";

/**
 * Bank-account (payout method) step of the "Finish registration" gate.
 *
 * The raw account number is masked to its last four digits ON THE DEVICE and
 * never transmitted or stored: only the provider and a masked label are sent to
 * `addPayoutMethod`, which stores an opaque token. This preserves the
 * payout-token boundary (no raw credentials server-side); live payout delivery
 * remains provider-gated.
 */
const PROVIDERS = [
  { key: "PH_GCASH", label: "GCash" },
  { key: "PH_MAYA", label: "Maya" },
  { key: "PH_BANK", label: "Bank account" },
];

export default function RegistrationBankScreen() {
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [provider, setProvider] = useState<string>(PROVIDERS[0]!.key);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signed-out") return <Redirect href="/(auth)/welcome" />;

  const digits = accountNumber.replace(/\D/g, "");
  const providerLabel = PROVIDERS.find((p) => p.key === provider)?.label ?? "Account";

  const handleSave = async () => {
    if (!session) return;
    setError(null);
    if (digits.length < 4) {
      setError("Enter the account number.");
      return;
    }
    // Mask on-device: keep only the last four digits for a display label.
    const last4 = digits.slice(-4);
    const name = accountName.trim();
    const maskedLabel = `${providerLabel} ••••${last4}${name ? ` (${name})` : ""}`.slice(0, 60);
    setSaving(true);
    try {
      const outcome = await repository.addPayoutMethod(session.userId, { provider, maskedLabel });
      if (!outcome.ok) {
        setError(outcome.reason);
        return;
      }
      notifyChanged();
      if (router.canGoBack()) router.back();
      else router.replace("/finish-registration");
    } catch {
      setError("Could not save your bank account. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={true} subPageTitle="Bank account">
        <Text style={styles.title}>Add a bank account</Text>
        <Text style={styles.intro}>
          Where you would like to receive your earnings. Only the last four digits are stored — your
          full account number never leaves this device.
        </Text>

        <Text style={styles.fieldLabel}>Provider</Text>
        <View style={styles.providerRow}>
          {PROVIDERS.map((p) => {
            const selected = p.key === provider;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={p.label}
                onPress={() => setProvider(p.key)}
                style={({ pressed }) => [
                  styles.providerChip,
                  selected ? styles.providerChipSelected : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text
                  style={[
                    styles.providerChipText,
                    selected ? styles.providerChipTextSelected : null,
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label="Account name"
          description="The name on the account."
          value={accountName}
          onChangeText={setAccountName}
          autoCapitalize="words"
          placeholder="Juan Dela Cruz"
          maxLength={80}
        />
        <TextField
          label="Account number"
          required
          description="Only the last four digits are kept."
          value={accountNumber}
          onChangeText={(text) => {
            setAccountNumber(text);
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          placeholder="•••• •••• 4567"
          maxLength={24}
          error={error ?? undefined}
        />

        <View style={styles.footer}>
          <Button
            label="Save bank account"
            icon="check-circle"
            fullWidth
            loading={saving}
            disabled={saving || digits.length < 4}
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
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  providerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  providerChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  providerChipSelected: { borderColor: theme.primary, backgroundColor: theme.surfaceBrand },
  providerChipText: { fontSize: fontSize.sm, fontWeight: "600", color: theme.textSecondary },
  providerChipTextSelected: { color: theme.primary },
  footer: { marginTop: spacing.xl },
});
