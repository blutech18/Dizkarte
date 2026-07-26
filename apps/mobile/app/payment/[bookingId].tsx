import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { LoadingState, ErrorState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type {
  CheckoutSessionRecord,
  CheckoutSimulationChoice,
} from "../../src/services/marketplace/types";
import { getAppConfig } from "../../src/lib/config";
import { theme, spacing, fontSize, radii } from "../../src/theme";

type Phase =
  | { readonly step: "loading" }
  | { readonly step: "error" }
  | { readonly step: "checkout"; readonly session: CheckoutSessionRecord }
  | {
      readonly step: "awaiting-webhook";
      readonly session: CheckoutSessionRecord;
      readonly choice: CheckoutSimulationChoice;
    }
  | { readonly step: "confirmed"; readonly session: CheckoutSessionRecord }
  | { readonly step: "failed"; readonly session: CheckoutSessionRecord }
  | { readonly step: "disabled" };

/**
 * Provider checkout boundary.
 *
 * Client-side navigation/choice NEVER marks the booking confirmed directly.
 * `simulateCheckout` only records the user's chosen deterministic outcome;
 * `processAuthoritativeWebhook` — modeling the provider's server-to-server
 * webhook — is the one place that actually transitions the booking, and it
 * runs as a distinct async step after the simulator "step" completes.
 *
 * Outside development/test this screen renders a disabled/fail-closed state
 * rather than ever claiming a live provider integration exists.
 */
export default function PaymentScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [phase, setPhase] = useState<Phase>({ step: "loading" });

  const isDevOrTest = (() => {
    try {
      const env = getAppConfig().environment;
      return env === "development" || env === "test";
    } catch {
      return false;
    }
  })();

  const load = useCallback(() => {
    if (!session) return;
    if (!isDevOrTest) {
      setPhase({ step: "disabled" });
      return;
    }
    setPhase({ step: "loading" });
    repository
      .createCheckoutSession(bookingId as BookingId, session.userId)
      .then((checkoutSession) => setPhase({ step: "checkout", session: checkoutSession }))
      .catch(() => setPhase({ step: "error" }));
  }, [bookingId, repository, session, isDevOrTest]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChoice = useCallback(
    async (choice: CheckoutSimulationChoice) => {
      if (phase.step !== "checkout") return;
      const checkoutSession = phase.session;
      await repository.simulateCheckout(checkoutSession.providerReference, choice);
      setPhase({ step: "awaiting-webhook", session: checkoutSession, choice });

      // Model the authoritative provider webhook as a distinct async step —
      // this component's own choice never sets CONFIRMED itself.
      const outcome = await repository.processAuthoritativeWebhook(
        checkoutSession.providerReference,
      );
      if (!outcome) {
        // cancel/retry: no authoritative effect yet.
        setPhase({ step: "checkout", session: checkoutSession });
        return;
      }
      notifyChanged();
      if (outcome.status === "CONFIRMED") {
        setPhase({ step: "confirmed", session: checkoutSession });
      } else {
        setPhase({ step: "failed", session: checkoutSession });
      }
    },
    [phase, repository, notifyChanged],
  );

  if (!session) return <DeniedState description="Sign in to complete payment." />;

  if (phase.step === "disabled") {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Payment" }} />
        <DeniedState
          title="Payment is unavailable"
          description="Live payment processing is disabled because no approved production payment provider is configured. This is expected outside development/test."
        />
      </Screen>
    );
  }

  if (phase.step === "loading") return <LoadingState label="Preparing checkout" />;
  if (phase.step === "error") return <ErrorState onRetry={load} />;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Payment" }} />
      <View style={styles.syntheticBanner} accessibilityRole="alert">
        <Text style={styles.syntheticBannerText}>SYNTHETIC PAYMENT — NO REAL MONEY</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.amount}>{formatPhp(phase.session.amountCentavos)}</Text>
        <Text style={styles.reference}>Reference: {phase.session.providerReference}</Text>
      </View>

      {phase.step === "checkout" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a deterministic outcome</Text>
          <Text style={styles.caption}>
            This simulates the provider checkout page. The outcome you pick is sent to a simulated
            webhook — the app itself does not mark this booking as paid.
          </Text>
          <Button label="Simulate success" onPress={() => handleChoice("success")} fullWidth />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Simulate failure"
            onPress={() => handleChoice("failure")}
            variant="destructive"
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Cancel checkout"
            onPress={() => handleChoice("cancel")}
            variant="secondary"
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Simulate retry"
            onPress={() => handleChoice("retry")}
            variant="secondary"
            fullWidth
          />
        </View>
      ) : null}

      {phase.step === "awaiting-webhook" ? (
        <LoadingState label="Waiting for provider confirmation" />
      ) : null}

      {phase.step === "confirmed" ? (
        <View style={styles.successCard}>
          <StatusBadge tone="success" label="Payment confirmed" />
          <Text style={styles.successText}>
            The provider confirmed payment. Chat and exact location are now available.
          </Text>
          <Button
            label="Go to booking"
            onPress={() => router.replace({ pathname: "/booking/[id]", params: { id: bookingId } })}
            fullWidth
          />
        </View>
      ) : null}

      {phase.step === "failed" ? (
        <View style={styles.failedCard}>
          <StatusBadge tone="error" label="Payment failed" />
          <Text style={styles.failedText}>
            The provider reported that this payment failed. You can retry checkout.
          </Text>
          <Button label="Retry checkout" onPress={load} fullWidth />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  syntheticBanner: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  syntheticBannerText: {
    color: theme.warningOnSoft,
    fontWeight: "800",
    textAlign: "center",
    fontSize: fontSize.sm,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  amount: { fontSize: fontSize.xxl, fontWeight: "700", color: theme.primary },
  reference: { fontSize: fontSize.xs, color: theme.textSecondary },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  caption: { fontSize: fontSize.xs, color: theme.textSecondary, marginBottom: spacing.sm },
  successCard: {
    backgroundColor: theme.successSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successText: { color: theme.successOnSoft, fontSize: fontSize.sm },
  failedCard: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  failedText: { color: theme.errorOnSoft, fontSize: fontSize.sm },
});
