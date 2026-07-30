import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { LoadingState, EmptyState } from "../src/components/ui/AsyncState";
import { MediaPicker } from "../src/components/media/MediaPicker";
import type { UploadedObject } from "../src/services/storage/upload";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type { SupportTicketRecord } from "../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../src/theme";

type Category = "payment" | "safety" | "quality" | "other";

/**
 * Help/safety/FAQ hub with a functional support ticket / report submission
 * flow. Copy is placeholder pending approved legal/safety text and is
 * conspicuously labeled as such — but the ticket submission itself is real
 * (against the synthetic marketplace repository), not a dead button.
 */
export default function SupportScreen() {
  const params = useLocalSearchParams<{ subjectType?: string; subjectId?: string }>();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [narrative, setNarrative] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [evidence, setEvidence] = useState<ReadonlyArray<UploadedObject>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SupportTicketRecord | null>(null);
  const [tickets, setTickets] = useState<ReadonlyArray<SupportTicketRecord>>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const subjectType =
    params.subjectType === "task" || params.subjectType === "booking" ? params.subjectType : "task";
  const subjectId = params.subjectId ?? "general";

  const loadHistory = useCallback(() => {
    if (!session) return;
    setLoadingHistory(true);
    repository
      .listMySupportTickets(session.userId)
      .then(setTickets)
      .finally(() => setLoadingHistory(false));
  }, [repository, session]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = useCallback(async () => {
    if (!session || narrative.trim().length === 0) return;
    setSubmitting(true);
    try {
      const ticket = await repository.submitSupportTicket({
        reporterId: session.userId,
        subjectType,
        subjectId,
        category,
        narrative,
        evidence: evidence.map((item) => ({
          kind: item.kind === "video" ? ("video" as const) : ("image" as const),
          fileName: item.fileName,
          storagePath: item.path,
        })),
      });
      setSubmitted(ticket);
      setNarrative("");
      setEvidence([]);
      loadHistory();
    } finally {
      setSubmitting(false);
    }
  }, [session, narrative, subjectType, subjectId, category, evidence, repository, loadHistory]);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Help & safety" }} />
      <View style={styles.pendingBanner}>
        <StatusBadge tone="warning" label="Pending approved copy" />
        <Text style={styles.pendingText}>
          Safety and legal content below is a placeholder pending Client-approved copy. It is not
          final guidance.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Frequently asked questions</Text>
      <Text style={styles.body}>
        Common questions about verification, payments, and bookings will appear here.
      </Text>

      <Text style={styles.sectionTitle}>Safety</Text>
      <Text style={styles.body}>
        Exact addresses and contact details are only shared with your booking counterpart after
        payment is confirmed.
      </Text>

      {session ? (
        <>
          <Text style={styles.sectionTitle}>Submit a support ticket / report a problem</Text>
          {submitted ? (
            <View style={styles.successCard}>
              <Text style={styles.successText}>
                Ticket submitted. We'll follow up with updates in Notifications.
              </Text>
              <Button
                label="Submit another"
                onPress={() => setSubmitted(null)}
                variant="secondary"
              />
            </View>
          ) : (
            <>
              <View style={styles.categoryRow}>
                {(["payment", "safety", "quality", "other"] as Category[]).map((option) => (
                  <Button
                    key={option}
                    label={option}
                    onPress={() => setCategory(option)}
                    variant={category === option ? "primary" : "secondary"}
                  />
                ))}
              </View>
              <TextField
                label="Describe the issue"
                required
                multiline
                value={narrative}
                onChangeText={setNarrative}
                description={`Regarding ${subjectType} ${subjectId === "general" ? "" : subjectId}`.trim()}
              />
              {/*
                Files upload before the ticket exists, so they are scoped to the
                task or booking being reported. The bucket policy still requires
                the path to begin with the reporter's own user id.
              */}
              <MediaPicker
                bucket="evidence"
                userId={session.userId}
                scopeId={subjectId}
                value={evidence}
                onChange={setEvidence}
                label="Evidence"
                hint="Screenshots or photos that show the problem."
                allowVideo
                disabled={submitting}
              />
              <Button
                label="Submit"
                onPress={handleSubmit}
                loading={submitting}
                disabled={narrative.trim().length === 0}
                fullWidth
              />
            </>
          )}

          <Text style={styles.sectionTitle}>Your ticket history</Text>
          {loadingHistory ? (
            <LoadingState label="Loading history" />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="No tickets yet"
              description="Submitted tickets and reports appear here."
            />
          ) : (
            tickets.map((ticket) => (
              <View key={ticket.id} style={styles.ticketCard}>
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketCategory}>{ticket.category}</Text>
                  <StatusBadge tone="info" label={ticket.status} />
                </View>
                <Text style={styles.body}>{ticket.narrative}</Text>
                {ticket.evidence.length > 0 ? (
                  <Text style={styles.meta}>
                    {ticket.evidence.length} evidence item{ticket.evidence.length === 1 ? "" : "s"}{" "}
                    attached
                  </Text>
                ) : null}
                <Text style={styles.meta}>{new Date(ticket.createdAt).toLocaleString()}</Text>
              </View>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pendingBanner: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  pendingText: {
    color: theme.warningOnSoft,
    fontSize: fontSize.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
  meta: { fontSize: fontSize.xs, color: theme.textSecondary },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  successCard: {
    backgroundColor: theme.successSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  successText: { color: theme.successOnSoft, fontSize: fontSize.sm },
  ticketCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  ticketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketCategory: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    textTransform: "capitalize",
  },
});
