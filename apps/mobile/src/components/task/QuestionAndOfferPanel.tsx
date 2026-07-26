import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { askQuestionSchema, submitOfferSchema, type TaskId } from "@dizkarte/domain";
import type { MobileSession } from "../../services/session-types";
import { isClient, isIdentityVerified } from "../../services/session-types";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { MyOfferHistoryList } from "./MyOfferHistoryList";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { DeniedState } from "../ui/AsyncState";
import { theme, spacing, fontSize, radii } from "../../theme";

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
  return <OfferForm taskId={taskId} session={session} />;
}

function OfferForm({
  taskId,
  session,
}: {
  readonly taskId: TaskId;
  readonly session: MobileSession;
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
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ask a question</Text>
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
            <Button label="Send question" onPress={submitQuestion} variant="secondary" />
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Submit an offer</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your offers on this task</Text>
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

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
  },
});
