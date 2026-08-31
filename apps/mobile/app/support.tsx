import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { Icon, type IconName } from "../src/components/ui/Icon";
import { LoadingState, EmptyState, ErrorState } from "../src/components/ui/AsyncState";
import { MediaPicker } from "../src/components/media/MediaPicker";
import { ProfilePageIntro, ProfilePageSection } from "../src/components/profile/ProfilePageSection";
import type { UploadedObject } from "../src/services/storage/upload";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type { SupportTicketRecord } from "../src/services/marketplace/types";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../src/theme";

type Category = "payment" | "safety" | "quality" | "other";
type HistoryState = "loading" | "loaded" | "error";

const CATEGORY_OPTIONS: ReadonlyArray<{
  readonly key: Category;
  readonly label: string;
  readonly icon: IconName;
}> = [
  { key: "payment", label: "Payment", icon: "wallet" },
  { key: "safety", label: "Safety", icon: "shield" },
  { key: "quality", label: "Work quality", icon: "star" },
  { key: "other", label: "Other", icon: "chat" },
];

export default function SupportScreen() {
  const params = useLocalSearchParams<{ subjectType?: string; subjectId?: string }>();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const { isTablet } = useResponsiveLayout();
  const [narrative, setNarrative] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [evidence, setEvidence] = useState<ReadonlyArray<UploadedObject>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SupportTicketRecord | null>(null);
  const [tickets, setTickets] = useState<ReadonlyArray<SupportTicketRecord>>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");

  const subjectType =
    params.subjectType === "task" || params.subjectType === "booking" ? params.subjectType : "task";
  const subjectId = params.subjectId ?? "general";

  const loadHistory = useCallback(() => {
    if (!session) {
      setHistoryState("loaded");
      return;
    }
    setHistoryState("loading");
    repository
      .listMySupportTickets(session.userId)
      .then((result) => {
        setTickets(result);
        setHistoryState("loaded");
      })
      .catch(() => setHistoryState("error"));
  }, [repository, session]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSubmit = useCallback(async () => {
    if (!session || !narrative.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
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
    } catch {
      setSubmitError("Could not submit your ticket. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    category,
    evidence,
    loadHistory,
    narrative,
    repository,
    session,
    subjectId,
    subjectType,
    submitting,
  ]);

  return (
    <Screen subPageTitle="Help & safety">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <ProfilePageIntro
          title="How can we help?"
          description="Review basic guidance or submit a support ticket with evidence."
        />

        <View style={styles.copyNotice}>
          <View style={styles.noticeHeader}>
            <Icon name="alert-circle" size={20} color={theme.warningOnSoft} />
            <Text style={styles.noticeTitle}>Guidance copy is pending approval</Text>
          </View>
          <Text style={styles.noticeDescription}>
            The informational text below is temporary and is not final legal or safety guidance.
            Ticket submission and case tracking are fully functional.
          </Text>
        </View>

        <View style={[styles.guidanceGrid, isTablet ? styles.guidanceGridTablet : null]}>
          <View style={[styles.guidanceItem, isTablet ? styles.guidanceItemTablet : null]}>
            <ProfilePageSection
              icon="note"
              title="Frequently asked questions"
              showDivider={false}
            >
              <Text style={styles.body}>
                More approved help articles will appear here as product guidance is finalized.
              </Text>
            </ProfilePageSection>
          </View>
          <View style={[styles.guidanceItem, isTablet ? styles.guidanceItemTablet : null]}>
            <ProfilePageSection
              icon="shield"
              title="Safety and privacy"
              showDivider={false}
            >
              <Text style={styles.body}>
                Exact addresses and contact details are shared only with the confirmed booking
                counterpart after payment is confirmed.
              </Text>
            </ProfilePageSection>
          </View>
        </View>

        {session ? (
          <>
            <ProfilePageSection
              icon="chat"
              title="Submit a support ticket"
              description={
                subjectId === "general"
                  ? "Describe the issue clearly and attach useful screenshots or photos."
                  : `Report an issue linked to ${subjectType} #${subjectId.slice(0, 8)}. Support will investigate.`
              }
            >
              {submitted ? (
                <View style={styles.successPanel}>
                  <Icon name="check-circle" size={24} color={theme.successOnSoft} />
                  <View style={styles.successText}>
                    <Text style={styles.successTitle}>Ticket submitted</Text>
                    <Text style={styles.successDescription}>
                      Updates will appear in Notifications and your ticket history.
                    </Text>
                  </View>
                  <Button
                    label="Submit another"
                    onPress={() => setSubmitted(null)}
                    variant="secondary"
                    fullWidth
                  />
                </View>
              ) : (
                <View style={styles.formContainer}>
                  {submitError ? (
                    <View style={styles.errorNotice} accessibilityRole="alert">
                      <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                      <Text style={styles.errorText}>{submitError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Issue category</Text>
                    <View style={styles.categoryGrid}>
                      {CATEGORY_OPTIONS.map((option) => {
                        const selected = category === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            onPress={() => {
                              setCategory(option.key);
                              setSubmitError(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={option.label}
                            style={({ pressed }) => [
                              styles.categoryCard,
                              selected ? styles.categoryCardSelected : null,
                              pressed ? styles.categoryCardPressed : null,
                            ]}
                          >
                            <Icon
                              name={option.icon}
                              size={15}
                              color={selected ? theme.primary : theme.textSecondary}
                            />
                            <Text
                              style={[
                                styles.categoryText,
                                selected ? styles.categoryTextSelected : null,
                              ]}
                              numberOfLines={1}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <TextField
                    label="Describe the issue"
                    required
                    multiline
                    value={narrative}
                    onChangeText={(text) => {
                      setNarrative(text);
                      setSubmitError(null);
                    }}
                    description="Include what happened, when it happened, and what resolution you need."
                    placeholder="Explain the problem in detail."
                    maxLength={1000}
                  />

                  <MediaPicker
                    bucket="evidence"
                    userId={session.userId}
                    scopeId={subjectId}
                    value={evidence}
                    onChange={setEvidence}
                    label="Evidence"
                    hint="Screenshots, photos, or a short video that show the problem."
                    allowVideo
                    disabled={submitting}
                  />

                  <Button
                    label="Submit ticket"
                    icon="send"
                    onPress={() => void handleSubmit()}
                    loading={submitting}
                    disabled={!narrative.trim()}
                    fullWidth
                  />
                </View>
              )}
            </ProfilePageSection>

            <ProfilePageSection
              icon="briefcase"
              title="Your ticket history"
              description="Track submitted requests and their current status."
              showDivider={false}
            >
              {historyState === "loading" ? <LoadingState label="Loading history" /> : null}
              {historyState === "error" ? (
                <ErrorState
                  title="Could not load ticket history"
                  description="Check your connection and try again."
                  onRetry={loadHistory}
                />
              ) : null}
              {historyState === "loaded" && tickets.length === 0 ? (
                <EmptyState
                  title="No tickets yet"
                  description="Submitted tickets and reports will appear here."
                />
              ) : null}
              {historyState === "loaded" && tickets.length > 0 ? (
                <View style={styles.ticketList}>
                  {tickets.map((ticket) => (
                    <View key={ticket.id} style={styles.ticketCard}>
                      <View style={styles.ticketHeader}>
                        <Text style={styles.ticketCategory}>{ticket.category}</Text>
                        <StatusBadge tone="info" label={ticket.status} />
                      </View>
                      <Text style={styles.ticketBody}>{ticket.narrative}</Text>
                      <View style={styles.ticketMetaRow}>
                        <Text style={styles.meta}>
                          {new Date(ticket.createdAt).toLocaleString()}
                        </Text>
                        {ticket.evidence.length > 0 ? (
                          <Text style={styles.meta}>
                            {ticket.evidence.length} attachment
                            {ticket.evidence.length === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </ProfilePageSection>
          </>
        ) : (
          <ProfilePageSection
            icon="lock"
            title="Sign in for support"
            description="A signed-in account is required to submit and track tickets."
            showDivider={false}
          >
            <Text style={styles.body}>Sign in from the welcome screen to contact support.</Text>
          </ProfilePageSection>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  copyNotice: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: theme.warningSoft,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: theme.warningOnSoft,
  },
  noticeDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.warningOnSoft,
  },
  guidanceGrid: {
    gap: spacing.md,
  },
  guidanceGridTablet: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  guidanceItem: {
    minWidth: 0,
  },
  guidanceItemTablet: {
    flex: 1,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  successPanel: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: theme.successSoft,
  },
  successText: {
    alignItems: "center",
    gap: spacing.xs,
  },
  successTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.successOnSoft,
  },
  successDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.successOnSoft,
    textAlign: "center",
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  formContainer: {
    gap: spacing.md,
  },
  linkedBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  linkedBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
  },
  categoryCard: {
    width: "48.5%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  categoryCardSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  categoryCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.textPrimary,
  },
  categoryTextSelected: {
    color: theme.primary,
    fontWeight: "700",
  },
  ticketList: {
    gap: spacing.sm,
  },
  ticketCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  ticketHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  ticketCategory: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    textTransform: "capitalize",
  },
  ticketBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textPrimary,
  },
  ticketMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  meta: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
});
