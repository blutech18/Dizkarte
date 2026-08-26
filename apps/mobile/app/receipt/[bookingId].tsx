import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { formatPhp, type BookingId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { Icon } from "../../src/components/ui/Icon";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { DeniedState, ErrorState, LoadingState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord } from "../../src/services/marketplace/types";
import {
  hasClearedPayment,
  settlementLabel,
  settlementStateFor,
  settlementTone,
} from "../../src/components/payments/paymentHistory";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Booking receipt.
 *
 * A record of one booking's money, readable by either party. Every value is
 * read from the booking itself — the agreed amount, the authoritative status,
 * the provider's payment reference, and the parties — so the receipt can only
 * ever restate what actually happened.
 *
 * It deliberately does NOT print a platform-fee or tax line. The platform fee
 * is held server-side and is not exposed to the mobile client, and the tax
 * treatment is not yet approved, so inventing either line would put a false
 * figure on a financial document. Until that model is configured the receipt
 * shows the agreed amount as the single charge and says the breakdown is
 * pending.
 */
export default function ReceiptScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session, status } = useSession();
  const { repository, revision } = useMarketplace();

  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const viewerId = session?.userId ?? null;

  const load = useCallback(() => {
    if (!viewerId || !bookingId) return;
    setState("loading");
    repository
      .getBooking(bookingId as BookingId, viewerId)
      .then((result) => {
        if (!result) {
          setState("denied");
          return;
        }
        setBooking(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, viewerId, bookingId]);

  useEffect(() => {
    load();
  }, [load, revision]);

  if (status === "loading") {
    return (
      <Screen subPageTitle="Receipt">
        <LoadingState label="Loading" />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Screen subPageTitle="Receipt">
      <Stack.Screen options={{ headerShown: false }} />

      {state === "loading" ? <LoadingState label="Loading receipt" /> : null}
      {state === "error" ? <ErrorState title="Could not load receipt" onRetry={load} /> : null}
      {state === "denied" ? (
        <DeniedState
          title="Receipt unavailable"
          description="You can only view receipts for bookings you are part of."
        />
      ) : null}

      {state === "loaded" && booking ? (
        <ReceiptBody booking={booking} viewerId={viewerId ?? ""} />
      ) : null}
    </Screen>
  );
}

function ReceiptBody({
  booking,
  viewerId,
}: {
  readonly booking: BookingRecord;
  readonly viewerId: string;
}) {
  const isClientSide = booking.clientId === viewerId;
  const settlement = settlementStateFor(booking.status);
  const cleared = hasClearedPayment(settlement);
  const { isCompactPhone } = useResponsiveLayout();

  return (
    <View style={styles.content}>
      {/* Top Digital Receipt Voucher Card */}
      <View style={[styles.heroCard, isCompactPhone ? styles.cardCompact : null]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTypeTag}>
            <Icon name="note" size={14} color={theme.primary} />
            <Text style={styles.heroTypeTagText}>
              {isClientSide ? "PAYMENT RECEIPT" : "PAYOUT RECORD"}
            </Text>
          </View>
          <StatusBadge
            tone={settlementTone(settlement)}
            label={settlementLabel(settlement, isClientSide ? "outgoing" : "earned")}
          />
        </View>

        <View style={styles.heroAmountBlock}>
          <Text style={styles.heroEyebrow}>
            {isClientSide ? "TOTAL AMOUNT PAID" : "TOTAL BOOKING VALUE"}
          </Text>
          <Text
            style={[styles.heroAmount, isCompactPhone ? styles.heroAmountCompact : null]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatPhp(booking.agreedCentavos)}
          </Text>
        </View>

        {cleared ? (
          <View style={styles.settlementBanner}>
            <View style={styles.noticeHeaderRow}>
              <Icon name="shield" size={14} color={theme.primary} />
              <Text style={styles.settlementHeaderLabel}>ESCROW PROTECTION</Text>
            </View>
            <Text style={styles.settlementBannerText}>
              {isClientSide
                ? "Funds are securely protected in escrow until you confirm completion."
                : "Funds are protected and will be released upon confirmed completion."}
            </Text>
          </View>
        ) : (
          <View style={styles.unclearedBanner}>
            <View style={styles.noticeHeaderRow}>
              <Icon name="alert-circle" size={14} color={theme.warningOnSoft} />
              <Text style={styles.unclearedHeaderLabel}>PAYMENT STATUS</Text>
            </View>
            <Text style={styles.unclearedBannerText}>
              This is not a record of payment yet — no funds have cleared for this booking.
            </Text>
          </View>
        )}
      </View>

      {/* Charges Breakdown */}
      <View style={[styles.card, isCompactPhone ? styles.cardCompact : null]}>
        <View style={styles.cardHeader}>
          <Icon name="wallet" size={16} color={theme.primary} />
          <Text style={styles.cardTitle}>Charges breakdown</Text>
        </View>

        <View style={styles.divider} />

        <Row
          label="Agreed task price"
          value={formatPhp(booking.agreedCentavos)}
          compact={isCompactPhone}
        />

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text
            style={[styles.totalValue, isCompactPhone ? styles.totalValueCompact : null]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatPhp(booking.agreedCentavos)}
          </Text>
        </View>

        <View style={styles.pendingNotice}>
          <View style={styles.noticeHeaderRow}>
            <Icon name="alert-circle" size={14} color={theme.textSecondary} />
            <Text style={styles.pendingNoticeLabel}>FEE & TAX NOTE</Text>
          </View>
          <Text style={styles.pendingNoticeText}>
            No platform fee or tax line is shown. Those figures are not part of this booking&apos;s
            record yet — they will appear once the charging and tax model is approved and
            configured. This receipt is not a tax invoice.
          </Text>
        </View>
      </View>

      {/* Booking & Transaction Details */}
      <View style={[styles.card, isCompactPhone ? styles.cardCompact : null]}>
        <View style={styles.cardHeader}>
          <Icon name="briefcase" size={16} color={theme.primary} />
          <Text style={styles.cardTitle}>Transaction details</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.taskBlock}>
          <Text style={styles.taskBlockLabel}>TASK</Text>
          <Text style={styles.taskBlockTitle}>{booking.taskTitle || "Untitled task"}</Text>
        </View>

        <View style={styles.subDivider} />

        <Row label="Client" value={booking.clientDisplayName || "—"} compact={isCompactPhone} />
        <Row label="Tasker" value={booking.taskerDisplayName || "—"} compact={isCompactPhone} />
        <Row
          label="Your role"
          value={isClientSide ? "Client (paying)" : "Tasker (earning)"}
          compact={isCompactPhone}
        />

        <View style={styles.subDivider} />

        <Row label="Booked on" value={fullDate(booking.createdAt)} compact={isCompactPhone} />
        <Row label="Last updated" value={fullDate(booking.updatedAt)} compact={isCompactPhone} />

        <View style={styles.subDivider} />

        <View style={styles.referenceSection}>
          <View style={styles.referenceTile}>
            <Text style={styles.referenceLabel}>BOOKING REFERENCE</Text>
            <Text style={styles.referenceValue} selectable>
              {booking.id}
            </Text>
          </View>
          <View style={styles.referenceTile}>
            <Text style={styles.referenceLabel}>PAYMENT REFERENCE</Text>
            <Text style={styles.referenceValue} selectable>
              {booking.paymentIntentId ?? "Not issued yet"}
            </Text>
          </View>
        </View>
      </View>

      <Button
        label="View booking details"
        icon="arrow-right"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: "/booking/[id]", params: { id: booking.id } })}
      />
    </View>
  );
}

function Row({
  label,
  value,
  mono = false,
  compact = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          compact ? styles.rowValueCompact : null,
          mono ? styles.rowValueMono : null,
        ]}
        numberOfLines={compact ? 3 : 2}
      >
        {value}
      </Text>
    </View>
  );
}

function fullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Hero Card
  heroCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardCompact: {
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  heroTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs + 2,
  },
  heroTypeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroTypeTagText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
  },
  heroAmountBlock: {
    gap: 2,
    paddingVertical: spacing.xs,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: theme.primary,
  },
  heroAmountCompact: {
    fontSize: 26,
  },

  // Notice Header & Body
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settlementHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.primary,
    textTransform: "uppercase",
  },
  settlementBanner: {
    gap: spacing.xs,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  settlementBannerText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 3,
    color: theme.textPrimary,
    fontWeight: "500",
  },
  unclearedHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.warningOnSoft,
    textTransform: "uppercase",
  },
  unclearedBanner: {
    gap: spacing.xs,
    backgroundColor: theme.warningSoft,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  unclearedBannerText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 3,
    color: theme.warningOnSoft,
    fontWeight: "500",
  },

  // Card Structure
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.xs,
  },
  subDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.xs / 2,
  },

  // Task block
  taskBlock: {
    gap: 2,
    paddingVertical: spacing.xs,
  },
  taskBlockLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
  },
  taskBlockTitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowCompact: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontWeight: "500",
    flexShrink: 0,
  },
  rowValue: {
    flex: 1,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: "600",
    textAlign: "right",
  },
  rowValueCompact: {
    fontSize: fontSize.xs + 1,
  },
  rowValueMono: {
    fontFamily: "monospace",
    fontSize: 11,
    color: theme.textSecondary,
  },

  // Reference Codes
  referenceSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  referenceTile: {
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: 2,
  },
  referenceLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
  },
  referenceValue: {
    fontFamily: "monospace",
    fontSize: 11,
    color: theme.textPrimary,
    fontWeight: "600",
  },

  // Total
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.primary,
  },
  totalValueCompact: {
    fontSize: fontSize.lg,
  },

  // Notices
  pendingNotice: {
    gap: spacing.xs,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  pendingNoticeLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSecondary,
    textTransform: "uppercase",
  },
  pendingNoticeText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 3,
    color: theme.textSecondary,
  },
});
