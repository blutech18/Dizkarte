import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { Icon } from "../src/components/ui/Icon";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import {
  isOfferRegistrationComplete,
  type OfferRegistrationStatus,
} from "../src/services/marketplace";
import { theme, spacing, fontSize, lineHeight, radii } from "../src/theme";

/**
 * "Finish registration" gate (Airtasker-style).
 *
 * A Tasker must provide three payment/contact items before they can make an
 * offer: a mobile number, a payout (bank) account, and a billing address. Each
 * row reflects live completion from `getOfferRegistrationStatus` and links to
 * its capture screen; "Continue" stays disabled until all three are done, then
 * returns the Tasker to the offer they were trying to make.
 */
const STEPS = [
  {
    key: "mobile" as const,
    group: "Provide a mobile number",
    label: "Enter your mobile number",
    route: "/registration/mobile",
  },
  {
    key: "bank" as const,
    group: "Provide a bank account",
    label: "Add a bank account",
    route: "/registration/bank",
  },
  {
    key: "billing" as const,
    group: "Provide a billing address",
    label: "Enter your billing address",
    route: "/registration/billing",
  },
] as const;

export default function FinishRegistrationScreen() {
  const { session, status } = useSession();
  const { repository, revision } = useMarketplace();
  const [regStatus, setRegStatus] = useState<OfferRegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const userId = session?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      setRegStatus(await repository.getOfferRegistrationStatus(userId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [repository, userId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  if (status === "signed-out") return <Redirect href="/(auth)/welcome" />;

  const complete = regStatus ? isOfferRegistrationComplete(regStatus) : false;
  const isDone = (key: (typeof STEPS)[number]["key"]) =>
    key === "mobile"
      ? (regStatus?.mobileComplete ?? false)
      : key === "bank"
        ? (regStatus?.bankComplete ?? false)
        : (regStatus?.billingComplete ?? false);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={true} subPageTitle="Finish registration">
        <Text style={styles.title}>To make offers, please:</Text>

        {loading && !regStatus ? (
          <LoadingState label="Checking your registration" />
        ) : error ? (
          <ErrorState onRetry={() => void load()} />
        ) : (
          <View style={styles.list}>
            {STEPS.map((step) => {
              const done = isDone(step.key);
              return (
                <View key={step.key} style={styles.group}>
                  <Text style={styles.groupLabel}>{step.group}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${step.label}${done ? ", completed" : ""}`}
                    accessibilityHint="Opens the form for this step"
                    onPress={() => router.push(step.route)}
                    style={({ pressed }) => [
                      styles.row,
                      done ? styles.rowDone : null,
                      pressed ? styles.rowPressed : null,
                    ]}
                  >
                    <View style={[styles.indicator, done ? styles.indicatorDone : null]}>
                      {done ? <Icon name="check-circle" size={16} color={theme.onPrimary} /> : null}
                    </View>
                    <Text style={styles.rowLabel}>{step.label}</Text>
                    <Icon name="arrow-right" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.footer}>
          <Button
            label="Continue"
            icon="check-circle"
            fullWidth
            disabled={!complete}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/browse");
            }}
            accessibilityHint={
              complete ? "Return to your offer" : "Complete all steps above to continue"
            }
          />
          <Text style={styles.footerNote}>
            Your details are used for account verification and receiving payments.
          </Text>
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
    marginBottom: spacing.lg,
    letterSpacing: -0.3,
  },
  list: { gap: spacing.lg },
  group: { gap: spacing.xs },
  groupLabel: { fontSize: fontSize.xs, color: theme.textSecondary, fontWeight: "600" },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  rowDone: { borderColor: theme.primary },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorDone: { backgroundColor: theme.primary, borderColor: theme.primary },
  rowLabel: { flex: 1, fontSize: fontSize.md, color: theme.textPrimary, fontWeight: "600" },
  footer: { marginTop: spacing.xl, gap: spacing.sm },
  footerNote: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    textAlign: "center",
  },
});
