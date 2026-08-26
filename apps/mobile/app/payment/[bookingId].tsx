import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { theme, spacing, fontSize, lineHeight, radii } from "../../src/theme";

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
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [phase, setPhase] = useState<Phase>({ step: "loading" });

  // Checkout is available in development/test (synthetic simulator) or whenever a
  // real provider is configured (sandbox/live). Otherwise it fails closed.
  const paymentContext = (() => {
    try {
      const cfg = getAppConfig();
      const isDevOrTest = cfg.environment === "development" || cfg.environment === "test";
      const mode = cfg.adapterModes.payment;
      return { enabled: isDevOrTest || mode === "sandbox" || mode === "live" };
    } catch {
      return { enabled: false };
    }
  })();

  const load = useCallback(() => {
    if (!session) return;
    if (!paymentContext.enabled) {
      setPhase({ step: "disabled" });
      return;
    }
    setPhase({ step: "loading" });
    repository
      .createCheckoutSession(bookingId as BookingId, session.userId)
      .then((checkoutSession) => setPhase({ step: "checkout", session: checkoutSession }))
      .catch(() => setPhase({ step: "error" }));
  }, [bookingId, repository, session, paymentContext.enabled]);

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

  /** Poll the authoritative payment state once; returns true when it resolved. */
  const pollStatus = useCallback(
    async (checkoutSession: CheckoutSessionRecord): Promise<boolean> => {
      const outcome = await repository.processAuthoritativeWebhook(
        checkoutSession.providerReference,
      );
      if (!outcome) return false;
      notifyChanged();
      setPhase({
        step: outcome.status === "CONFIRMED" ? "confirmed" : "failed",
        session: checkoutSession,
      });
      return true;
    },
    [repository, notifyChanged],
  );

  /**
   * Real provider checkout: open the hosted checkout page, then poll for the
   * authoritative webhook outcome. Navigation/closing the page never confirms
   * the booking — only the provider webhook does, which `pollStatus` observes.
   */
  const handleOpenCheckout = useCallback(async () => {
    if (phase.step !== "checkout") return;
    const checkoutSession = phase.session;
    await WebBrowser.openBrowserAsync(checkoutSession.checkoutUrl);
    setPhase({ step: "awaiting-webhook", session: checkoutSession, choice: "success" });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const resolved = await pollStatus(checkoutSession);
      if (resolved) return;
    }
    // Not confirmed yet — return to checkout so the user can re-open or re-check.
    setPhase({ step: "checkout", session: checkoutSession });
  }, [phase, pollStatus]);

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  if (phase.step === "disabled") {
    return (
      <Screen subPageTitle="Payment">
        <Stack.Screen options={{ headerShown: false }} />
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
    <Screen subPageTitle="Payment">
      <Stack.Screen options={{ headerShown: false }} />
      {/*
        Kept as an alert: no approved payment provider is configured, so nothing
        on this screen moves real money. The wording states that plainly rather
        than implying a live checkout.
      */}
      {/*
        Banner reflects whether this is the development simulator (no money) or a
        real provider checkout (sandbox/live).
      */}
      {phase.session.synthetic ? (
        <View style={styles.syntheticBanner} accessibilityRole="alert">
          <Text style={styles.syntheticBannerText}>
            Test checkout — no payment is taken and no money moves
          </Text>
        </View>
      ) : phase.session.mode === "sandbox" ? (
        <View style={styles.syntheticBanner} accessibilityRole="alert">
          <Text style={styles.syntheticBannerText}>
            Sandbox checkout — provider test mode, no real money moves
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.amount}>{formatPhp(phase.session.amountCentavos)}</Text>
        <Text style={styles.reference}>Reference: {phase.session.providerReference}</Text>
      </View>

      {phase.step === "checkout" && phase.session.synthetic ? (
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

      {phase.step === "checkout" && !phase.session.synthetic ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pay securely</Text>
          <Text style={styles.caption}>
            You&apos;ll be taken to the provider&apos;s secure checkout to pay with GCash, Maya, or
            a card. Your booking is confirmed only after the provider confirms payment.
          </Text>
          <Button
            label="Open secure checkout"
            onPress={() => void handleOpenCheckout()}
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="I've paid — check status"
            variant="secondary"
            onPress={() => void pollStatus(phase.session)}
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
  caption: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
  successCard: {
    backgroundColor: theme.successSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successText: { color: theme.successOnSoft, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  failedCard: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  failedText: { color: theme.errorOnSoft, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
});
