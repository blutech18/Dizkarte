import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { askQuestionSchema, submitOfferSchema, type TaskId } from "@dizkarte/domain";
import type { MobileSession } from "../../services/session-types";
import { isClient, isIdentityVerified } from "../../services/session-types";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { MyOfferHistoryList } from "./MyOfferHistoryList";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { DeniedState, LoadingState } from "../ui/AsyncState";
import {
  isOfferRegistrationComplete,
  type OfferRegistrationStatus,
} from "../../services/marketplace";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../theme";

export type QuestionAndOfferPanelProps = {
  readonly taskId: TaskId;
  readonly eligibleToOffer: boolean;
  readonly session: MobileSession | null;
};

/**
 * Pre-payment question + complete offer form.
 *
 * Only eligible (approved, non-suspended) Taskers can submit an offer
 * (requirement R6). Clients viewing their own task never see this offer
 * form; unapproved/unauthenticated visitors see an explicit denial rather
 * than a broken or silently hidden control.
 */
export function QuestionAndOfferPanel({
  taskId,
  eligibleToOffer,
  session,
}: QuestionAndOfferPanelProps) {
  if (!session) {
    return <DeniedState description="Sign in to ask a question or submit an offer." />;
  }
  if (isClient(session)) {
    return null;
  }
  if (!eligibleToOffer) {
    const description =
      session.accountStatus !== "active"
        ? "Your account is not currently active, so you cannot submit offers."
        : !isIdentityVerified(session)
          ? "Complete identity verification and Tasker approval before you can submit offers."
          : "Your Tasker application must be approved before you can submit offers.";
    return <DeniedState title="Tasker approval required" description={description} />;
  }
  return <OfferGate taskId={taskId} session={session} />;
}

/**
 * "Finish registration" gate (Airtasker-style): an approved, verified Tasker
 * must still have a mobile number, a payout (bank) account, and a billing
 * address before the offer form is shown. Reflects live completion and links to
 * the checklist; `submit_offer` enforces the same requirement server-side.
 */
function OfferGate({
  taskId,
  session,
}: {
  readonly taskId: TaskId;
  readonly session: MobileSession;
}) {
  const { repository, revision } = useMarketplace();
  const { isTablet } = useResponsiveLayout();
  const [regStatus, setRegStatus] = useState<OfferRegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRegStatus(await repository.getOfferRegistrationStatus(session.userId));
    } catch {
      setRegStatus(null);
    } finally {
      setLoading(false);
    }
  }, [repository, session.userId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  if (loading && !regStatus) {
    return <LoadingState label="Checking your registration" />;
  }
  if (regStatus && isOfferRegistrationComplete(regStatus)) {
    return <OfferForm taskId={taskId} session={session} isTablet={isTablet} />;
  }

  const remaining = [
    regStatus?.mobileComplete ? null : "mobile number",
    regStatus?.bankComplete ? null : "bank account",
    regStatus?.billingComplete ? null : "billing address",
  ].filter((item): item is string => item !== null);

  return (
    <View style={[styles.registrationCard, isTablet ? styles.panelPaddingTablet : null]}>
      <View style={styles.registrationHeader}>
        <Text style={styles.registrationEyebrow}>OFFER ACCESS</Text>
        <View style={styles.registrationTitleRow}>
          <Icon name="lock" size={20} color={theme.primary} />
          <Text style={styles.registrationTitle}>Finish registration to make offers</Text>
        </View>
      </View>
      <Text style={styles.registrationBody}>
        Add your {remaining.length > 0 ? remaining.join(", ") : "remaining details"} before sending
        a proposal. The same requirement is enforced when an offer is submitted.
      </Text>
      <Button
        label="Finish registration"
        icon="arrow-right"
        fullWidth
        onPress={() => router.push("/finish-registration")}
      />
    </View>
  );
}

function OfferForm({
  taskId,
  session,
  isTablet,
}: {
  readonly taskId: TaskId;
  readonly session: MobileSession;
  readonly isTablet: boolean;
}) {
  const { repository, notifyChanged } = useMarketplace();
  const [questionBody, setQuestionBody] = useState("");
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [eta, setEta] = useState("");
  const [availability, setAvailability] = useState("");
  const [experience, setExperience] = useState("");
  const [offerErrors, setOfferErrors] = useState<Record<string, string>>({});
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerResult, setOfferResult] = useState<"idle" | "success" | "error">("idle");

  async function submitQuestion() {
    const parsed = askQuestionSchema.safeParse({ taskId, body: questionBody });
    if (!parsed.success) {
      setQuestionError(parsed.error.issues[0]?.message);
      return;
    }
    setQuestionError(undefined);
    await repository.askQuestion(taskId, session.userId, session.displayName, parsed.data.body);
    setQuestionSubmitted(true);
    setQuestionBody("");
  }

  async function submitOffer() {
    const parsedAmount = Number(amount.replace(/[^\d.]/g, "")) * 100;
    const parsed = submitOfferSchema.safeParse({
      taskId,
      amountCentavos: Math.round(parsedAmount),
      message,
      etaText: eta,
      availabilityText: availability,
      experienceText: experience,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] = issue.message;
      }
      setOfferErrors(next);
      return;
    }
    setOfferErrors({});
    setOfferSubmitting(true);
    try {
      // Persisted through the shared `MobileMarketplacePort` — real session
      // state, not a screen-local success message. `notifyChanged` tells the
      // Tasker Dashboard / offer history to refetch immediately.
      await repository.submitOffer(taskId, session.userId, session.displayName, {
        amountCentavos: parsed.data.amountCentavos,
        message: parsed.data.message,
        etaText: parsed.data.etaText,
        availabilityText: parsed.data.availabilityText,
        experienceText: parsed.data.experienceText,
      });
      setOfferResult("success");
      notifyChanged();
    } catch {
      setOfferResult("error");
    } finally {
      setOfferSubmitting(false);
    }
  }

  return (
    <View style={styles.formStack}>
      <View style={[styles.section, isTablet ? styles.panelPaddingTablet : null]}>
        <WorkspaceSectionHeader
          eyebrow="BEFORE YOU QUOTE"
          icon="chat"
          title="Ask a question"
          description="Confirm important scope details without exchanging private contact information."
        />
        {questionSubmitted ? (
          <Text style={styles.successText}>Your question was sent to the Client.</Text>
        ) : (
          <>
            <TextField
              label="Question"
              value={questionBody}
              onChangeText={setQuestionBody}
              multiline
              error={questionError}
              description="Keep questions specific to this task. Contact details cannot be exchanged here."
            />
            <Button
              label="Send question"
              onPress={submitQuestion}
              variant="secondary"
              fullWidth={!isTablet}
            />
          </>
        )}
      </View>

      <View style={[styles.section, isTablet ? styles.panelPaddingTablet : null]}>
        <WorkspaceSectionHeader
          eyebrow="YOUR PROPOSAL"
          icon="briefcase"
          title="Make an offer"
          description="Give the Client one complete price, timeline, availability, and relevant experience."
        />
        {offerResult === "success" ? (
          <Text style={styles.successText}>
            Your offer was submitted. You will be notified if it is selected. See it below in "Your
            offers on this task".
          </Text>
        ) : (
          <>
            {offerResult === "error" ? (
              <Text style={styles.errorText}>Could not submit your offer. Please try again.</Text>
            ) : null}
            <TextField
              label="Your price (PHP)"
              required
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              error={offerErrors.amountCentavos}
            />
            <TextField
              label="Message to Client"
              required
              value={message}
              onChangeText={setMessage}
              multiline
              error={offerErrors.message}
            />
            <TextField
              label="Estimated time to complete"
              required
              value={eta}
              onChangeText={setEta}
              error={offerErrors.etaText}
            />
            <TextField
              label="Availability"
              required
              value={availability}
              onChangeText={setAvailability}
              error={offerErrors.availabilityText}
            />
            <TextField
              label="Relevant experience"
              required
              value={experience}
              onChangeText={setExperience}
              multiline
              error={offerErrors.experienceText}
            />
            <Button
              label="Submit offer"
              onPress={submitOffer}
              loading={offerSubmitting}
              fullWidth
            />
          </>
        )}
      </View>

      <View style={[styles.section, isTablet ? styles.panelPaddingTablet : null]}>
        <WorkspaceSectionHeader
          eyebrow="OFFER ACTIVITY"
          icon="note"
          title="Your offers on this task"
          description="Track every proposal you have submitted for this brief."
        />
        <MyOfferHistoryList
          taskerId={session.userId}
          taskId={taskId}
          emptyTitle="No offers yet"
          emptyDescription="Offers you submit on this task will appear here."
        />
      </View>
    </View>
  );
}

function WorkspaceSectionHeader({
  eyebrow,
  icon,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <View style={styles.workspaceHeader}>
      <Text style={styles.workspaceEyebrow}>{eyebrow}</Text>
      <View style={styles.workspaceTitleRow}>
        <Icon name={icon} size={20} color={theme.primary} />
        <Text style={styles.workspaceTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Text style={styles.workspaceDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  registrationCard: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  panelPaddingTablet: {
    padding: spacing.lg,
  },
  registrationHeader: {
    minWidth: 0,
    gap: spacing.sm,
  },
  registrationEyebrow: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  registrationTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  registrationTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  registrationBody: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  formStack: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
  },
  section: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  workspaceHeader: {
    minWidth: 0,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  workspaceEyebrow: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  workspaceTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  workspaceTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  workspaceDescription: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  successText: {
    color: theme.successOnSoft,
    backgroundColor: theme.successSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
});
