import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatPhp } from "@dizkarte/domain";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { StatusBadge, type BadgeTone } from "../ui/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "../ui/AsyncState";
import type { WithdrawalRecord } from "../../services/marketplace/types";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

type LoadState = "loading" | "loaded" | "error";

const STATUS_TONE: Record<WithdrawalRecord["status"], BadgeTone> = {
  REQUESTED: "info",
  RESERVED: "warning",
  PROCESSING: "warning",
  PAID: "success",
  FAILED: "error",
  CANCELLED: "neutral",
};

export type WithdrawalPanelProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly availableCentavos: number;
  /**
   * Explicit, typed fail-closed flag: always `false` in this pass (no live
   * payout provider is configured — task 9.1). When `false`, the request
   * control is always disabled and the panel states plainly that no payout
   * provider is configured, regardless of available balance.
   */
  readonly payoutProviderAvailable: false;
  /** Called after a request attempt so the caller can refresh ledger figures. */
  readonly onSettled: () => void;
};

/**
 * Withdrawal request + history.
 *
 * No live payout provider is configured in this pass (task 9.1). Every
 * request is recorded, then deterministically resolved as
 * `PROVIDER_UNAVAILABLE` — this is never displayed as a successful payout.
 * The request control is disabled outright based on the typed
 * `payoutProviderAvailable` flag, not inferred from a request outcome —
 * the UI never suggests a real payout can be initiated.
 */
export function WithdrawalPanel({
  visible,
  onClose,
  availableCentavos,
  payoutProviderAvailable,
  onSettled,
}: WithdrawalPanelProps) {
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [amount, setAmount] = useState("");
  const [history, setHistory] = useState<ReadonlyArray<WithdrawalRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .listWithdrawals(session.userId)
      .then((result) => {
        setHistory(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function handleRequest() {
    if (!session) return;
    if (!payoutProviderAvailable) {
      setOutcomeMessage(
        "No payout provider is configured in this environment. Withdrawal requests cannot be initiated.",
      );
      return;
    }
    const centavos = Math.round(Number(amount.replace(/[^\d.]/g, "")) * 100);
    if (!Number.isFinite(centavos) || centavos <= 0) {
      setFormError("Enter a valid withdrawal amount in PHP.");
      return;
    }
    if (centavos > availableCentavos) {
      setFormError("You cannot withdraw more than your available balance.");
      return;
    }
    setFormError(null);
    setOutcomeMessage(null);
    setSubmitting(true);
    try {
      const outcome = await repository.requestWithdrawal(session.userId, centavos);
      if (!outcome.ok) {
        setOutcomeMessage(
          outcome.reason === "PROVIDER_UNAVAILABLE"
            ? "No payout provider is configured in this environment. Your request was recorded but cannot be processed yet — this is not a real payout."
            : outcome.reason === "INSUFFICIENT_AVAILABLE_BALANCE"
              ? "You cannot withdraw more than your available balance."
              : "This withdrawal request could not be submitted.",
        );
      } else {
        setOutcomeMessage("Withdrawal requested.");
      }
      setAmount("");
      load();
      onSettled();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Withdrawals</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close withdrawals"
              style={styles.closeButton}
            >
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.available}>
              Available for withdrawal: {formatPhp(availableCentavos)}
            </Text>
            <View style={styles.providerNotice} accessibilityRole="alert">
              <Text style={styles.providerNoticeText}>
                {payoutProviderAvailable
                  ? "Requests are recorded for testing but never produce a real payout."
                  : "No payout provider is configured in this environment. Withdrawal requests cannot be initiated — this is not a real payout capability."}
              </Text>
            </View>
            <TextField
              label="Withdrawal amount (PHP)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              error={formError ?? undefined}
              editable={payoutProviderAvailable}
            />
            <Button
              label={payoutProviderAvailable ? "Request withdrawal" : "Withdrawal unavailable"}
              onPress={handleRequest}
              loading={submitting}
              disabled={!payoutProviderAvailable || availableCentavos <= 0}
              {...(payoutProviderAvailable
                ? {}
                : { accessibilityHint: "No payout provider is configured in this environment." })}
              fullWidth
            />
            {!payoutProviderAvailable ? (
              <Text style={styles.disabledNote} accessibilityRole="text">
                No payout provider is configured. This control cannot initiate a real payout.
              </Text>
            ) : availableCentavos <= 0 ? (
              <Text style={styles.disabledNote}>
                You have no available balance to withdraw right now.
              </Text>
            ) : null}
            {outcomeMessage ? (
              <Text
                style={styles.outcomeText}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {outcomeMessage}
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>History</Text>
            {state === "loading" ? <LoadingState label="Loading withdrawal history" /> : null}
            {state === "error" ? <ErrorState onRetry={load} /> : null}
            {state === "loaded" && history.length === 0 ? (
              <EmptyState
                title="No withdrawal requests yet"
                description="Requests you submit will appear here."
              />
            ) : null}
            {state === "loaded" &&
              history.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <View style={styles.historyRowHeader}>
                    <Text style={styles.historyAmount}>{formatPhp(item.amountCentavos)}</Text>
                    <StatusBadge tone={STATUS_TONE[item.status]} label={item.status} />
                  </View>
                  <Text style={styles.historyMeta}>
                    Requested {new Date(item.requestedAt).toLocaleString()}
                  </Text>
                  {item.failureReason ? (
                    <Text style={styles.historyFailure}>{item.failureReason}</Text>
                  ) : null}
                </View>
              ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: theme.textPrimary },
  closeButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  closeLabel: { color: theme.primary, fontWeight: "600", fontSize: fontSize.md },
  body: { padding: spacing.lg, gap: spacing.md },
  available: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  providerNotice: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  providerNoticeText: { color: theme.warningOnSoft, fontSize: fontSize.xs, fontWeight: "600" },
  disabledNote: { fontSize: fontSize.xs, color: theme.textSecondary },
  outcomeText: {
    color: theme.infoOnSoft,
    backgroundColor: theme.infoSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  historyRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyAmount: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  historyMeta: { fontSize: fontSize.xs, color: theme.textSecondary },
  historyFailure: { fontSize: fontSize.xs, color: theme.errorOnSoft },
});
