import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatPhp } from "@dizkarte/domain";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import type { MyOfferHistoryItem } from "../../services/marketplace/types";
import { Button } from "../ui/Button";
import { StatusBadge, type BadgeTone } from "../ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../ui/AsyncState";
import { theme, spacing, fontSize, radii } from "../../theme";

type LoadState = "loading" | "loaded" | "error";

const OFFER_STATUS_TONE: Record<MyOfferHistoryItem["offer"]["status"], BadgeTone> = {
  SUBMITTED: "brand",
  SELECTED: "success",
  WITHDRAWN: "neutral",
  REJECTED: "error",
  EXPIRED: "neutral",
};

export type MyOfferHistoryListProps = {
  readonly taskerId: string;
  /** Restrict to a single task's offers (task-detail context). Omit for the full cross-task history (Tasker Dashboard). */
  readonly taskId?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
};

/**
 * Single, reusable rendering of the current Tasker's offer history —
 * task, amount, submission date, status, and withdrawal/unavailable state —
 * sourced from `listMyOffers` (one projection). Used both for a single
 * task's "your offers on this task" section and for the Tasker Dashboard's
 * complete cross-task offer history, so the two views never duplicate
 * rendering logic or drift out of sync.
 */
export function MyOfferHistoryList({
  taskerId,
  taskId,
  emptyTitle = "No offers yet",
  emptyDescription = "Offers you submit will appear here.",
}: MyOfferHistoryListProps) {
  const { repository, revision } = useMarketplace();
  const [items, setItems] = useState<ReadonlyArray<MyOfferHistoryItem>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState("loading");
    repository
      .listMyOffers(taskerId)
      .then((all) => {
        setItems(taskId ? all.filter((item) => item.offer.taskId === taskId) : all);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, taskerId, taskId]);

  useEffect(() => {
    load();
  }, [load, revision]);

  async function handleWithdraw(offerId: string) {
    setWithdrawingId(offerId);
    try {
      await repository.withdrawOffer(offerId, taskerId);
    } finally {
      setWithdrawingId(null);
      load();
    }
  }

  if (state === "loading") return <LoadingState label="Loading your offers" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <View>
      {items.map((item) => (
        <View key={item.offer.id} style={styles.row}>
          <View style={styles.headerRow}>
            <Text style={styles.taskTitle} numberOfLines={1}>
              {item.taskTitle}
            </Text>
            <StatusBadge tone={OFFER_STATUS_TONE[item.offer.status]} label={item.offer.status} />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.amount}>{formatPhp(item.offer.amountCentavos)}</Text>
            <Text style={styles.date}>{new Date(item.offer.createdAt).toLocaleDateString()}</Text>
          </View>
          {item.taskStatus === "REMOVED" ? (
            <Text style={styles.unavailableNote}>This task is no longer available.</Text>
          ) : null}
          {item.canWithdraw ? (
            <Button
              label="Withdraw offer"
              onPress={() => handleWithdraw(item.offer.id)}
              variant="text"
              loading={withdrawingId === item.offer.id}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  taskTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amount: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  date: { fontSize: fontSize.xs, color: theme.textSecondary },
  unavailableNote: {
    fontSize: fontSize.xs,
    color: theme.warningOnSoft,
    backgroundColor: theme.warningSoft,
    padding: spacing.xs,
    borderRadius: radii.sm,
  },
});
