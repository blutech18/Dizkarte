import { Pressable, StyleSheet, Text, View } from "react-native";
import { AttachmentLabel } from "../ui/AttachmentLabel";
import { Button, type ButtonVariant } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { StatusBadge } from "../ui/StatusBadge";
import { SignedImage } from "../media/SignedImage";
import { formatPhp } from "@dizkarte/domain";
import type { BookingRecord, CompletionEvidenceItem } from "../../services/marketplace/types";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";
import {
  PROGRESS_STEPS,
  statusPresentationFor,
  type BookingPrimaryAction,
  type BookingRole,
  type BookingStatusPresentation,
  type BookingStatusTone,
} from "./bookingStatusPresentation";

/**
 * Callbacks the route/controller wires to the single role-appropriate primary
 * action, plus the always-available record/support/coordination destinations.
 * The workspace never performs a mutation or navigation itself — it only calls
 * back — so authorization and the privacy gate stay with the route.
 */
export type BookingStatusWorkspaceProps = {
  readonly booking: BookingRecord;
  readonly role: BookingRole;
  /** Result of the domain `isCommunicationUnlocked(status)` — never re-derived here. */
  readonly unlocked: boolean;
  readonly counterpartName: string;
  /** Already role-selected masked contact (client sees Tasker's, Tasker sees Client's). */
  readonly counterpartContact: string;
  readonly actionPending: boolean;
  readonly actionError: string | null;
  readonly onPrimaryAction: () => void;
  readonly onOpenReceipt: () => void;
  readonly onOpenChat: () => void;
  readonly onOpenDispute: () => void;
  readonly onReportProblem: () => void;
};

type ToneStyle = { readonly solid: string; readonly soft: string; readonly onSoft: string };

const TONE_STYLE: Record<BookingStatusTone, ToneStyle> = {
  warning: { solid: theme.warningSolid, soft: theme.warningSoft, onSoft: theme.warningOnSoft },
  error: { solid: theme.errorSolid, soft: theme.errorSoft, onSoft: theme.errorOnSoft },
  info: { solid: theme.infoSolid, soft: theme.infoSoft, onSoft: theme.infoOnSoft },
  success: { solid: theme.successSolid, soft: theme.successSoft, onSoft: theme.successOnSoft },
  brand: { solid: theme.primary, soft: theme.primarySoft, onSoft: theme.primaryPressed },
  neutral: { solid: theme.textSecondary, soft: theme.surfaceSubtle, onSoft: theme.textPrimary },
};

type ActionButtonSpec = {
  readonly label: string;
  readonly icon: IconName;
  readonly variant: ButtonVariant;
  /** Repository mutations show a spinner and surface `actionError`. */
  readonly mutation: boolean;
};

const ACTION_BUTTON: Record<Exclude<BookingPrimaryAction, "none">, ActionButtonSpec> = {
  "continue-payment": {
    label: "Continue to payment",
    icon: "wallet",
    variant: "primary",
    mutation: false,
  },
  "retry-payment": { label: "Retry payment", icon: "wallet", variant: "primary", mutation: false },
  "start-work": { label: "Start work", icon: "check-circle", variant: "primary", mutation: true },
  "request-completion": {
    label: "Request completion",
    icon: "note",
    variant: "primary",
    mutation: false,
  },
  "confirm-release": {
    label: "Confirm & release funds",
    icon: "check-circle",
    variant: "primary",
    mutation: true,
  },
  "leave-review": { label: "Leave a review", icon: "star", variant: "secondary", mutation: false },
};

/** Who the waiting participant is blocked on, for active states with no self-action. */
function waitingText(p: BookingStatusPresentation): string {
  if (p.status === "PAYMENT_PENDING") return "Waiting for the Client to complete payment.";
  if (p.status === "COMPLETION_REQUESTED")
    return "Waiting for the Client to review your work and release the funds.";
  if (p.status === "CONFIRMED") return "Waiting for the Tasker to start the work.";
  if (p.status === "IN_PROGRESS") return "Waiting for the Tasker to submit completion.";
  return "Waiting for the other participant.";
}

/** Short closure/exception line for terminal, no-action states. */
function closureText(p: BookingStatusPresentation): string {
  switch (p.status) {
    case "PAYMENT_FAILED":
      return "No action is needed from you. The Client can retry the payment.";
    case "CANCELLED":
      return "This booking is closed. Your receipt stays available below.";
    case "DISPUTED":
      return "Support is reviewing this case. Add details through support below.";
    case "REFUNDED":
      return "This booking is settled and closed. Your receipt stays available below.";
    default:
      return "This booking is closed.";
  }
}

/**
 * Full participant booking page for one authoritative status + role.
 *
 * Reading order: booked task and participant → one status/progress/action
 * checkpoint → private details → support. The same hierarchy is retained on
 * larger screens while status facts use the available horizontal space.
 */
export function BookingStatusWorkspace({
  booking,
  role,
  unlocked,
  counterpartName,
  counterpartContact,
  actionPending,
  actionError,
  onPrimaryAction,
  onOpenReceipt,
  onOpenChat,
  onOpenDispute,
  onReportProblem,
}: BookingStatusWorkspaceProps) {
  const presentation = statusPresentationFor(booking.status, role);
  const toneStyle = TONE_STYLE[presentation.tone];

  return (
    <View style={styles.container}>
      <BookingIdentityDocument
        counterpartName={counterpartName}
        counterpartRoleLabel={role === "client" ? "YOUR TASKER" : "YOUR CLIENT"}
        statusLabel={presentation.statusLabel}
        statusTone={presentation.tone}
        taskTitle={booking.taskTitle}
        amountLabel={formatPhp(booking.agreedCentavos)}
        onOpenReceipt={onOpenReceipt}
      />

      <View style={[styles.statusWorkspaceCard, { borderColor: toneStyle.soft }]}>
        <StatusHero presentation={presentation} toneStyle={toneStyle} />

        {presentation.progressIndex !== null ? (
          <LifecycleRail currentIndex={presentation.progressIndex} />
        ) : null}

        <StatusPrimaryPanel
          presentation={presentation}
          booking={booking}
          toneStyle={toneStyle}
          actionPending={actionPending}
          onPrimaryAction={onPrimaryAction}
        />
      </View>

      {actionError ? (
        <View style={styles.errorBanner}>
          <View style={styles.errorBannerIconSlot}>
            <Icon name="alert-circle" size={16} color={theme.errorOnSoft} />
          </View>
          <Text
            style={styles.errorBannerText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {actionError}
          </Text>
        </View>
      ) : null}

      <BookingAccessPanel
        status={booking.status}
        unlocked={unlocked}
        exactAddress={booking.exactAddress}
        contact={counterpartContact}
        onOpenChat={onOpenChat}
      />

      <SupportPanel
        canDispute={presentation.canDispute}
        onOpenDispute={onOpenDispute}
        onReportProblem={onReportProblem}
      />
    </View>
  );
}

function BookingIdentityDocument({
  counterpartName,
  counterpartRoleLabel,
  statusLabel,
  statusTone,
  taskTitle,
  amountLabel,
  onOpenReceipt,
}: {
  readonly counterpartName: string;
  readonly counterpartRoleLabel: string;
  readonly statusLabel: string;
  readonly statusTone: BookingStatusTone;
  readonly taskTitle: string;
  readonly amountLabel: string;
  readonly onOpenReceipt: () => void;
}) {
  const initials = counterpartName.slice(0, 2).toUpperCase() || "?";

  return (
    <View style={styles.bookingDocument}>
      <View style={styles.taskSummary}>
        <Text style={styles.taskTitle} accessibilityRole="header">
          {taskTitle || "Untitled task"}
        </Text>
        <View style={styles.taskFooterRow}>
          <Text style={styles.taskFooterLabel}>Status</Text>
          <StatusBadge
            tone={statusTone}
            label={statusLabel}
            accessibilityLabel={`Booking status: ${statusLabel}`}
          />
        </View>
      </View>

      <View style={styles.overviewCard}>
        <View style={styles.participantRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.participantInfo}>
            <Text style={styles.counterpartName} numberOfLines={1}>
              {counterpartName}
            </Text>
            <Text style={styles.identityEyebrow}>{counterpartRoleLabel}</Text>
          </View>
        </View>

        <View style={styles.financialRow}>
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>AGREED AMOUNT</Text>
            <Text
              style={styles.amount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {amountLabel}
            </Text>
          </View>
          <Pressable
            onPress={onOpenReceipt}
            accessibilityRole="button"
            accessibilityLabel="See receipt for this booking"
            style={({ pressed }) => [
              styles.receiptButton,
              pressed ? styles.receiptButtonPressed : null,
            ]}
          >
            <Icon name="note" size={14} color={theme.primary} />
            <Text style={styles.receiptButtonText}>See receipt</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StatusHero({
  presentation,
}: {
  readonly presentation: BookingStatusPresentation;
  readonly toneStyle?: ToneStyle;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {presentation.title}
        </Text>
        <Text style={styles.heroDescription}>{presentation.description}</Text>
      </View>

      <View style={styles.heroFacts}>
        {presentation.facts.map((fact) => (
          <View
            key={fact.label}
            style={styles.heroFactTile}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${fact.label}: ${fact.value}`}
          >
            <Text style={styles.heroFactLabel}>{fact.label.toUpperCase()}</Text>
            <Text style={styles.heroFactValue} numberOfLines={2}>
              {fact.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LifecycleRail({ currentIndex }: { readonly currentIndex: number }) {
  const completedWidth = `${(currentIndex / (PROGRESS_STEPS.length - 1)) * 100}%` as const;
  const currentLabel = PROGRESS_STEPS[currentIndex] ?? PROGRESS_STEPS[0];

  return (
    <View style={styles.railCard}>
      <View style={styles.railHeader}>
        <Text style={styles.railTitle}>Booking progress</Text>
        <Text style={styles.railMeta}>
          Step {currentIndex + 1} of {PROGRESS_STEPS.length}
        </Text>
      </View>
      <View
        style={styles.stepper}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Booking progress"
        accessibilityValue={{
          min: 1,
          max: PROGRESS_STEPS.length,
          now: currentIndex + 1,
          text: `${currentLabel}, step ${currentIndex + 1} of ${PROGRESS_STEPS.length}`,
        }}
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: completedWidth }]} />
        </View>
        <View style={styles.stepItems}>
          {PROGRESS_STEPS.map((label, index) => {
            const reached = index <= currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <View key={label} style={styles.stepItem}>
                <View style={styles.stepDotSlot}>
                  <View
                    style={[
                      styles.stepDot,
                      reached ? styles.stepDotReached : null,
                      isCurrent ? styles.stepDotCurrent : null,
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    reached ? styles.stepLabelReached : null,
                    isCurrent ? styles.stepLabelCurrent : null,
                  ]}
                  numberOfLines={2}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function StatusPrimaryPanel({
  presentation,
  booking,
  toneStyle,
  actionPending,
  onPrimaryAction,
}: {
  readonly presentation: BookingStatusPresentation;
  readonly booking: BookingRecord;
  readonly toneStyle: ToneStyle;
  readonly actionPending: boolean;
  readonly onPrimaryAction: () => void;
}) {
  const hasAction = presentation.primaryAction !== "none";
  const kind = hasAction
    ? "action"
    : presentation.lifecycleGroup === "active"
      ? "waiting"
      : "closure";
  const showEvidence = booking.status === "COMPLETION_REQUESTED";
  const isClient = presentation.role === "client";
  const spec = hasAction
    ? ACTION_BUTTON[presentation.primaryAction as Exclude<BookingPrimaryAction, "none">]
    : null;

  return (
    <View style={styles.panelCard}>
      {hasAction ? <Text style={styles.panelNote}>{presentation.roleNote}</Text> : null}

      {showEvidence ? (
        <CompletionEvidencePanel
          items={booking.completionEvidence}
          description={
            isClient
              ? "Review the submitted proof before releasing funds."
              : "This is the proof you submitted for the Client to review."
          }
        />
      ) : null}

      {spec ? (
        <View style={styles.panelAction}>
          <Button
            label={spec.label}
            icon={spec.icon}
            variant={spec.variant}
            onPress={onPrimaryAction}
            loading={spec.mutation ? actionPending : false}
            fullWidth
          />
          {presentation.primaryAction === "confirm-release" ? (
            <Text style={styles.panelFootnote}>
              Release is Client-confirmed and manual. No Tasker or automatic release occurs.
            </Text>
          ) : null}
        </View>
      ) : null}

      {kind === "waiting" ? (
        <View style={styles.waitingPanel}>
          <View style={styles.waitingIconSlot}>
            <Icon name="more-horizontal" size={16} color={theme.textSecondary} />
          </View>
          <Text style={styles.waitingText}>{waitingText(presentation)}</Text>
        </View>
      ) : null}

      {kind === "closure" ? (
        <View style={[styles.closureNote, { backgroundColor: toneStyle.soft }]}>
          <Text style={[styles.closureNoteText, { color: toneStyle.onSoft }]}>
            {closureText(presentation)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CompletionEvidencePanel({
  items,
  description,
}: {
  readonly items: ReadonlyArray<CompletionEvidenceItem>;
  readonly description: string;
}) {
  return (
    <View style={styles.evidenceBlock}>
      <View style={styles.evidenceHeader}>
        <Icon name="note" size={17} color={theme.primary} />
        <Text style={styles.evidenceTitle}>Completion evidence</Text>
      </View>
      <Text style={styles.evidenceDescription}>{description}</Text>
      {items.length === 0 ? (
        <Text style={styles.infoText}>No evidence submitted.</Text>
      ) : (
        <View style={styles.evidenceList}>
          {items.map((item) => (
            <View key={item.id} style={styles.evidenceItem}>
              {item.kind === "image" && item.storagePath ? (
                <SignedImage
                  bucket="evidence"
                  path={item.storagePath}
                  accessibilityLabel={`Completion evidence ${item.fileName ?? ""}`}
                />
              ) : null}
              <AttachmentLabel
                kind={item.kind}
                text={item.kind === "note" ? (item.note ?? "") : (item.fileName ?? "")}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BookingAccessPanel({
  status,
  unlocked,
  exactAddress,
  contact,
  onOpenChat,
}: {
  readonly status: BookingRecord["status"];
  readonly unlocked: boolean;
  readonly exactAddress: string | null;
  readonly contact: string;
  readonly onOpenChat: () => void;
}) {
  const coordinationClosed = status === "CANCELLED" || status === "REFUNDED";

  return (
    <View style={styles.accessCard}>
      <View style={styles.accessHeadingBlock}>
        <View style={styles.accessHeader}>
          <Text style={styles.accessTitle}>Location & contact</Text>
          <View
            style={styles.accessState}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Booking details: ${unlocked ? "Open" : coordinationClosed ? "Closed" : "Locked"}`}
          >
            <Icon
              name={unlocked ? "check-circle" : coordinationClosed ? "alert-circle" : "lock"}
              size={15}
              color={unlocked ? theme.successSolid : theme.textSecondary}
            />
            <Text style={[styles.accessStateText, unlocked ? styles.accessStateTextOpen : null]}>
              {unlocked ? "Open" : coordinationClosed ? "Closed" : "Locked"}
            </Text>
          </View>
        </View>

        <Text style={styles.accessIntroduction}>
          {unlocked
            ? "Payment is confirmed. Use these details only to coordinate this booking."
            : coordinationClosed
              ? "This booking is closed. Private location, contact, and chat are no longer available."
              : "Private coordination details open only after the payment provider confirms the booking."}
        </Text>
      </View>

      {unlocked ? (
        <>
          <View style={styles.accessTable}>
            <View style={styles.accessDetailBlock}>
              <View style={styles.detailLabelRow}>
                <Icon name="map-pin" size={16} color={theme.primary} />
                <Text style={styles.accessRowLabel}>TASK LOCATION</Text>
              </View>
              <Text style={styles.accessRowValue}>{exactAddress || "Address unavailable"}</Text>
            </View>
            <View style={styles.accessDetailBlock}>
              <View style={styles.detailLabelRow}>
                <Icon name="phone" size={16} color={theme.primary} />
                <Text style={styles.accessRowLabel}>CONTACT</Text>
              </View>
              <Text style={styles.accessRowValue}>{contact}</Text>
            </View>
          </View>
          <Button label="Open chat" icon="chat" onPress={onOpenChat} variant="secondary" fullWidth />
        </>
      ) : coordinationClosed ? (
        <View style={styles.accessMatrixGrid}>
          <View style={styles.accessMatrixTile}>
            <View style={styles.detailLabelRow}>
              <Icon name="note" size={14} color={theme.textSecondary} />
              <Text style={styles.accessRowLabel}>BOOKING RECORD</Text>
            </View>
            <Text style={styles.accessTileValue}>Task, amount, receipt & status</Text>
          </View>
          <View style={styles.accessMatrixTile}>
            <View style={styles.detailLabelRow}>
              <Icon name="alert-circle" size={14} color={theme.textSecondary} />
              <Text style={styles.accessRowLabel}>COORDINATION</Text>
            </View>
            <Text style={styles.accessTileValue}>Closed</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.accessMatrixGrid}>
            <View style={styles.accessMatrixTile}>
              <View style={styles.detailLabelRow}>
                <Icon name="check-circle" size={14} color={theme.successSolid} />
                <Text style={styles.accessRowLabel}>AVAILABLE NOW</Text>
              </View>
              <Text style={styles.accessTileValue}>Task and payment status</Text>
            </View>
            <View style={styles.accessMatrixTile}>
              <View style={styles.detailLabelRow}>
                <Icon name="lock" size={14} color={theme.primary} />
                <Text style={styles.accessRowLabel}>AFTER CONFIRMATION</Text>
              </View>
              <Text style={styles.accessTileValue}>Exact location, contact & chat</Text>
            </View>
          </View>

          <View style={styles.accessPolicyBanner}>
            <Icon name="shield" size={14} color={theme.textSecondary} />
            <Text
              style={styles.accessPolicyText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Access is protected until payment is confirmed.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function SupportPanel({
  canDispute,
  onOpenDispute,
  onReportProblem,
}: {
  readonly canDispute: boolean;
  readonly onOpenDispute: () => void;
  readonly onReportProblem: () => void;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeadingBlock}>
        <View style={styles.sectionHeading}>
          <Icon name="shield" size={21} color={theme.primary} />
          <Text style={styles.sectionHeaderTitle}>Need help?</Text>
        </View>
        <Text style={styles.sectionHeaderDescription}>
          Get support or escalate an issue connected to this booking.
        </Text>
      </View>
      <View style={styles.helpGroup}>
        {canDispute ? (
          <HelpRow
            icon="shield"
            title="Open a dispute"
            subtitle="Escalate this booking for review"
            isDestructive
            onPress={onOpenDispute}
          />
        ) : null}
        <HelpRow
          icon="note"
          title="Report a problem"
          subtitle="Contact support about this booking"
          onPress={onReportProblem}
        />
      </View>
    </View>
  );
}

function HelpRow({
  icon,
  title,
  subtitle,
  onPress,
  isDestructive = false,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
  readonly isDestructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => [styles.helpRow, pressed ? styles.helpRowPressed : null]}
    >
      <View style={styles.helpLeadingIcon}>
        <Icon name={icon} size={20} color={isDestructive ? theme.errorSolid : theme.primary} />
      </View>
      <View style={styles.helpContent}>
        <Text style={[styles.helpTitle, isDestructive ? styles.helpTitleDestructive : null]}>
          {title}
        </Text>
        <Text style={styles.helpSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.helpTrailingIcon}>
        <Icon name="chevron-right" size={16} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 0,
    width: "100%",
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Booking summary
  bookingDocument: {
    width: "100%",
    minWidth: 0,
    gap: spacing.lg,
  },
  taskSummary: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
  },
  taskTitle: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  taskFooterRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: 2,
  },
  taskFooterLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  overviewCard: {
    minWidth: 0,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
  },
  participantRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: theme.primary,
  },
  avatarText: {
    color: theme.onPrimary,
    fontSize: fontSize.sm,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  participantInfo: {
    minWidth: 0,
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  counterpartName: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  identityEyebrow: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  overviewDivider: {
    height: 1,
    width: "100%",
    backgroundColor: theme.borderSubtle,
  },
  financialRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  amountBlock: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  amountLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  amount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
  },
  receiptButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  receiptButtonPressed: {
    opacity: 0.75,
    backgroundColor: theme.primarySoft,
  },
  receiptButtonText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },

  // Unified status checkpoint
  statusWorkspaceCard: {
    minWidth: 0,
    gap: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  statusSectionDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  heroCard: {
    minWidth: 0,
    gap: spacing.md,
  },
  heroCopy: {
    minWidth: 0,
    gap: 6,
  },
  heroTitle: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  heroDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  heroFacts: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: 2,
  },
  heroFactTile: {
    minWidth: 0,
    flex: 1,
    gap: 3,
    padding: spacing.md - 2,
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  heroFactLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  heroFactValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },

  // Lifecycle rail
  railCard: {
    minWidth: 0,
    gap: spacing.md,
  },
  railHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  railTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  railMeta: {
    flexShrink: 0,
    color: theme.primary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  stepper: {
    position: "relative",
    minWidth: 0,
  },
  progressTrack: {
    position: "absolute",
    top: 9,
    left: "12.5%",
    right: "12.5%",
    height: 2,
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: theme.borderSubtle,
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: theme.primary,
  },
  stepItems: {
    flexDirection: "row",
  },
  stepItem: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  stepDotSlot: {
    width: "100%",
    height: 20,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDot: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: theme.surface,
    borderRadius: 6,
    backgroundColor: theme.borderSubtle,
  },
  stepDotReached: {
    backgroundColor: theme.primary,
  },
  stepDotCurrent: {
    width: 18,
    height: 18,
    borderWidth: 3,
    borderColor: theme.primarySoft,
    borderRadius: 9,
    backgroundColor: theme.primary,
  },
  stepLabel: {
    minHeight: 28,
    paddingHorizontal: 2,
    color: theme.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  stepLabelReached: {
    color: theme.textPrimary,
    fontWeight: "600",
  },
  stepLabelCurrent: {
    color: theme.primaryPressed,
    fontWeight: "800",
  },
  // Primary status panel
  panelCard: {
    minWidth: 0,
    gap: spacing.md,
  },
  panelNote: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  panelAction: {
    minWidth: 0,
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  panelFootnote: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  waitingPanel: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  waitingIconSlot: {
    height: lineHeight.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  waitingText: {
    minWidth: 0,
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  closureNote: {
    minWidth: 0,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  closureNoteText: {
    minWidth: 0,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },

  // Evidence
  evidenceBlock: {
    minWidth: 0,
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  evidenceTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  evidenceDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  evidenceList: {
    gap: spacing.sm,
  },
  evidenceItem: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  infoText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },

  // Access panel
  accessCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  accessHeadingBlock: {
    minWidth: 0,
    gap: spacing.xs,
  },
  accessHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  accessTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  accessState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  accessStateText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  accessStateTextOpen: {
    color: theme.successOnSoft,
  },
  accessIntroduction: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 2,
  },
  accessTable: {
    gap: spacing.sm,
  },
  accessDetailBlock: {
    minWidth: 0,
    gap: spacing.xs,
  },
  detailLabelRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  accessRowLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  accessRowValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  accessMatrixGrid: {
    minWidth: 0,
    gap: spacing.sm,
  },
  accessMatrixTile: {
    minWidth: 0,
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  accessTileValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },
  accessPolicyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingTop: 2,
  },
  accessPolicyText: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 2,
  },

  // Support
  sectionCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  sectionHeadingBlock: {
    minWidth: 0,
    gap: spacing.xs,
  },
  sectionHeading: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  sectionHeaderDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 2,
  },
  helpGroup: {
    overflow: "hidden",
    borderRadius: radii.sm,
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  helpRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  helpRowPressed: {
    opacity: 0.8,
  },
  helpLeadingIcon: {
    width: 22,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  helpContent: {
    minWidth: 0,
    flex: 1,
    gap: 1,
  },
  helpTitle: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: 18,
    fontWeight: "700",
  },
  helpTitleDestructive: {
    color: theme.errorSolid,
  },
  helpSubtitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  helpTrailingIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  // Error
  errorBanner: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorBannerIconSlot: {
    height: lineHeight.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBannerText: {
    minWidth: 0,
    flex: 1,
    color: theme.errorOnSoft,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
});
