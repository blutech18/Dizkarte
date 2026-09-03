import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { StatusBadge } from "../../../src/components/ui/StatusBadge";
import { AttachmentLabel } from "../../../src/components/ui/AttachmentLabel";
import { SignedImage } from "../../../src/components/media/SignedImage";
import { Icon, type IconName } from "../../../src/components/ui/Icon";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import { KeyboardAvoider } from "../../../src/components/ui/KeyboardAvoider";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { isClient, isIdentityVerified } from "../../../src/services/session-types";
import type {
  DraftTaskInput,
  OwnedTaskRecord,
  TaskMediaAttachment,
} from "../../../src/services/marketplace/types";
import { timeOfDayLabel } from "../../../src/components/task/taskDraftValue";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  useResponsiveLayout,
} from "../../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

function taskTimingLabel(task: OwnedTaskRecord["draft"]): string {
  const period = timeOfDayLabel(task.timeOfDay);
  const suffix = period ? ` · ${period}` : "";
  if (task.sameDay) return `Needed today${suffix}`;
  if (!task.scheduledFor) return `Flexible schedule${suffix}`;
  const scheduled = new Date(task.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return `Flexible schedule${suffix}`;
  const weekday = scheduled.toLocaleDateString("en-US", { weekday: "long" });
  const datePart = scheduled.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday} - ${datePart}${suffix}`;
}

function PreviewPageShell({ children }: { readonly children: ReactNode }) {
  return (
    <Screen subPageTitle="Review task">
      <Stack.Screen options={{ headerShown: false }} />
      {children}
    </Screen>
  );
}

/** Owner-only review step before publishing. */
export default function PreviewTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { gutter, isTablet } = useResponsiveLayout();
  const [task, setTask] = useState<OwnedTaskRecord | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getOwnedTask(id as TaskId, session.userId)
      .then((result) => {
        if (!result) {
          setState("denied");
          return;
        }
        setTask(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePublish = useCallback(async () => {
    if (!session || !task) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const verified = isClient(session) && isIdentityVerified(session);
      const result = await repository.publishTask(task.id, session.userId, verified);
      if (!result.ok) {
        setPublishError(
          result.reason === "NOT_VERIFIED"
            ? "Identity verification is required before you can publish a task."
            : result.reason === "FORBIDDEN"
              ? "You do not have permission to publish this task."
              : "This task cannot be published from its current state.",
        );
        return;
      }
      notifyChanged();
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }, [repository, session, task, notifyChanged]);

  if (status === "loading") {
    return (
      <PreviewPageShell>
        <LoadingState label="Loading" />
      </PreviewPageShell>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") {
    return (
      <PreviewPageShell>
        <LoadingState label="Loading preview" />
      </PreviewPageShell>
    );
  }
  if (state === "error") {
    return (
      <PreviewPageShell>
        <ErrorState onRetry={load} />
      </PreviewPageShell>
    );
  }
  if (state === "denied" || !task) {
    return (
      <PreviewPageShell>
        <DeniedState title="Task not found" description="This draft could not be loaded." />
      </PreviewPageShell>
    );
  }

  if (published) {
    return (
      <Screen subPageTitle="Task published">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.actionCard}>
          <View style={styles.actionHeader}>
            <Icon name="check-circle" size={21} color={theme.successSolid} />
            <Text style={styles.actionTitle} accessibilityRole="header">
              Your task is live
            </Text>
          </View>
          <Text style={styles.actionDescription}>
            Approved Taskers nearby can now see it and submit offers.
          </Text>
          <Button
            label="Go to My Tasks"
            icon="arrow-right"
            onPress={() => router.replace("/(tabs)/my-tasks")}
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  const verified = isClient(session) && isIdentityVerified(session);
  const budgetLabel = formatPhp(task.draft.budgetCentavos || 0);
  const mediaSize = isTablet ? 112 : 96;

  return (
    <Screen subPageTitle="Review task" scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoider style={styles.page}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.contentFrame, { paddingHorizontal: gutter }]}>
            <View style={styles.container}>
              <View style={styles.taskDocument}>
                <View style={styles.taskSummaryCard}>
                  <Text style={styles.taskTitle} accessibilityRole="header">
                    {task.draft.title || "Untitled task"}
                  </Text>
                  <Text style={styles.taskDescription}>
                    {task.draft.description || "No description added."}
                  </Text>
                </View>
                <View style={styles.overviewCard}>
                  <View style={styles.summaryTopRow}>
                    <Text style={styles.overviewSectionTitle}>Details</Text>
                    <StatusBadge
                      tone="warning"
                      label="Draft"
                      accessibilityLabel="Task status: Draft"
                    />
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaLabelRow}>
                      <Icon name="calendar" size={14} color={theme.primary} />
                      <Text style={styles.metaLabel}>SCHEDULE</Text>
                    </View>
                    <Text style={styles.metaValue}>{taskTimingLabel(task.draft)}</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaLabelRow}>
                      <Icon name="map-pin" size={14} color={theme.primary} />
                      <Text style={styles.metaLabel}>APPROXIMATE AREA</Text>
                    </View>
                    <Text style={styles.metaValue}>
                      {task.draft.landmark?.trim() || "No landmark set"}
                    </Text>
                  </View>

                  <View style={styles.budgetRow}>
                    <Text style={styles.budgetLabel}>Starting budget</Text>
                    <Text style={styles.budgetAmount} numberOfLines={1}>
                      {budgetLabel}
                    </Text>
                  </View>
                </View>
              </View>

              <PublishingCheckpoint verified={verified} />
              <TaskerVisibilityCard draft={task.draft} />
              <PrivateDetailsCard exactAddress={task.draft.exactAddress} />
              <MediaCard media={task.draft.media} mediaSize={mediaSize} />

              {publishError ? (
                <View style={styles.errorBanner}>
                  <Icon name="alert-circle" size={16} color={theme.errorOnSoft} />
                  <Text
                    style={styles.errorBannerText}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {publishError}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.actionFooter, { paddingVertical: spacing.md }]}>
          <View style={[styles.actionFooterInner, { paddingHorizontal: gutter }]}>
            {isTablet ? (
              <View style={styles.footerContext}>
                <Text style={styles.footerEyebrow}>FINAL REVIEW</Text>
                <Text style={styles.footerTitle}>
                  {verified ? "Ready to publish" : "Verification required"}
                </Text>
              </View>
            ) : null}
            <View style={[styles.footerActions, isTablet ? styles.footerActionsTablet : undefined]}>
              <View style={[styles.editAction, isTablet ? styles.editActionTablet : undefined]}>
                <Button
                  label="Edit"
                  icon="edit"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: "/task/[id]/edit", params: { id: task.id } })
                  }
                  fullWidth
                />
              </View>
              <View
                style={[styles.primaryAction, isTablet ? styles.primaryActionTablet : undefined]}
              >
                <Button
                  label={verified ? "Publish task" : "Verify first"}
                  icon={verified ? "send" : "shield"}
                  onPress={verified ? handlePublish : () => router.push("/verification")}
                  loading={verified && publishing}
                  accessibilityHint={
                    verified
                      ? "Publishes this task for Taskers to see"
                      : "Opens identity verification"
                  }
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoider>
    </Screen>
  );
}

function PublishingCheckpoint({ verified }: { readonly verified: boolean }) {
  const { isTablet, isCompactPhone, isNarrowPhone } = useResponsiveLayout();
  const accentColor = verified ? theme.successSolid : theme.warningSolid;
  const stateColor = verified ? theme.successOnSoft : theme.warningOnSoft;
  const stateLabel = verified ? "Ready" : "Action needed";
  const checkpointTitleSize = isTablet
    ? fontSize.lg
    : isNarrowPhone
      ? fontSize.sm
      : isCompactPhone
        ? fontSize.md - 1
        : fontSize.md;
  const checkpointTitleLineHeight = checkpointTitleSize + 6;

  return (
    <View style={[styles.checkpointCard, isCompactPhone ? { padding: spacing.md } : undefined]}>
      <View style={styles.checkpointHeader}>
        <View style={styles.checkpointTitleRow}>
          <Icon name={verified ? "check-circle" : "shield"} size={20} color={accentColor} />
          <Text
            style={[
              styles.checkpointTitle,
              { fontSize: checkpointTitleSize, lineHeight: checkpointTitleLineHeight },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            accessibilityRole="header"
          >
            {verified ? "Ready to publish" : "Verify identity to publish"}
          </Text>
        </View>

        <View
          style={styles.checkpointState}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Publishing status: ${stateLabel}`}
        >
          <View style={[styles.checkpointStateDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.checkpointStateText, { color: stateColor }]}>{stateLabel}</Text>
        </View>
      </View>

      <Text style={styles.checkpointDescription}>
        {verified
          ? "Review the Tasker-facing details and publish when everything looks right."
          : "Your work is saved privately. Identity verification is required before Taskers can see it."}
      </Text>

      <View style={[styles.checkpointFacts, isTablet ? styles.checkpointFactsTablet : undefined]}>
        <View style={[styles.checkpointFact, isTablet ? styles.checkpointFactTablet : undefined]}>
          <Text style={styles.checkpointFactLabel}>Draft state</Text>
          <Text style={styles.checkpointFactValue}>Saved privately</Text>
        </View>
        <View
          style={[
            styles.checkpointFact,
            styles.checkpointFactSecondary,
            isTablet ? styles.checkpointFactTablet : undefined,
            isTablet ? styles.checkpointFactSecondaryTablet : undefined,
          ]}
        >
          <Text style={styles.checkpointFactLabel}>Tasker visibility</Text>
          <Text style={styles.checkpointFactValue}>
            {verified ? "Ready after publishing" : "Locked until verified"}
          </Text>
        </View>
      </View>

      {!verified ? (
        <View style={styles.checkpointAction}>
          <Button
            label="Start verification"
            icon="shield"
            onPress={() => router.push("/verification")}
            fullWidth
          />
        </View>
      ) : null}
    </View>
  );
}

function TaskerVisibilityCard({ draft }: { readonly draft: DraftTaskInput }) {
  return (
    <View style={styles.accessCard}>
      <View style={styles.accessHeader}>
        <Text style={styles.accessTitle} accessibilityRole="header">
          Visible after publishing
        </Text>
        <View
          style={styles.accessState}
          accessible
          accessibilityRole="text"
          accessibilityLabel="Tasker-facing details: Public"
        >
          <Icon name="globe" size={16} color={theme.successSolid} />
          <Text style={styles.accessStateTextPublic}>Public</Text>
        </View>
      </View>

      <Text style={styles.accessIntroduction}>
        Taskers use these details to understand the location and timing before making an offer.
      </Text>

      <View style={styles.accessTable}>
        <DetailBlock
          icon="map-pin"
          label="APPROXIMATE AREA"
          value={draft.landmark || "No landmark set"}
        />
        <DetailBlock icon="calendar" label="SCHEDULE" value={taskTimingLabel(draft)} />
        <DetailBlock
          icon="wallet"
          label="STARTING BUDGET"
          value={formatPhp(draft.budgetCentavos || 0)}
        />
      </View>

      <View style={styles.accessPolicy}>
        <View style={styles.detailLabelRow}>
          <Icon name="shield" size={16} color={theme.textSecondary} />
          <Text style={styles.accessPolicyLabel}>PRIVACY NOTE</Text>
        </View>
        <Text style={styles.accessPolicyText}>
          Exact address and direct contact details are not included in this public preview.
        </Text>
      </View>
    </View>
  );
}

function PrivateDetailsCard({ exactAddress }: { readonly exactAddress: string }) {
  return (
    <View style={styles.accessCard}>
      <View style={styles.accessHeader}>
        <Text style={styles.accessTitle} accessibilityRole="header">
          Exact task address
        </Text>
        <View
          style={styles.accessState}
          accessible
          accessibilityRole="text"
          accessibilityLabel="Exact task address: Locked"
        >
          <Icon name="lock" size={16} color={theme.textSecondary} />
          <Text style={styles.accessStateText}>Locked</Text>
        </View>
      </View>

      <Text style={styles.accessIntroduction}>
        This address is visible to you here but remains hidden from the public task.
      </Text>

      <View style={styles.accessTable}>
        <DetailBlock
          icon="map-pin"
          label="TASK LOCATION"
          value={exactAddress || "No exact address set"}
        />
      </View>

      <View style={styles.accessPolicy}>
        <View style={styles.detailLabelRow}>
          <Icon name="shield" size={16} color={theme.textSecondary} />
          <Text style={styles.accessPolicyLabel}>PRIVACY NOTE</Text>
        </View>
        <Text style={styles.accessPolicyText}>
          Shared only with the selected Tasker after provider-confirmed payment.
        </Text>
      </View>
    </View>
  );
}

function DetailBlock({
  icon,
  label,
  value,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.accessDetailBlock}>
      <View style={styles.detailLabelRow}>
        <Icon name={icon} size={18} color={theme.primary} />
        <Text style={styles.accessRowLabel}>{label}</Text>
      </View>
      <Text style={styles.accessRowValue}>{value}</Text>
    </View>
  );
}

function MediaCard({
  media,
  mediaSize,
}: {
  readonly media: ReadonlyArray<TaskMediaAttachment>;
  readonly mediaSize: number;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeadingBlock}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeading}>
            <Icon name="image" size={21} color={theme.primary} />
            <Text style={styles.sectionHeaderTitle} accessibilityRole="header">
              Task media
            </Text>
          </View>
          <StatusBadge
            tone="neutral"
            label={String(media.length)}
            accessibilityLabel={`${String(media.length)} media attachment${media.length === 1 ? "" : "s"}`}
          />
        </View>
        <Text style={styles.sectionHeaderDescription}>
          Photos and video appear with the public task to help Taskers quote accurately.
        </Text>
      </View>

      {media.length === 0 ? (
        <View style={styles.mediaEmpty}>
          <Text style={styles.infoText}>No media added.</Text>
          <Text style={styles.footnote}>You can add photos or video from the edit screen.</Text>
        </View>
      ) : (
        <View style={styles.mediaGrid}>
          {media.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.mediaItem,
                { width: mediaSize },
                item.kind === "video" ? styles.mediaFileItem : undefined,
              ]}
            >
              {item.kind === "image" ? (
                <>
                  <SignedImage
                    bucket="task-media"
                    path={item.storagePath}
                    width={mediaSize}
                    height={mediaSize}
                    accessibilityLabel={`Task photo ${item.fileName}`}
                    style={styles.mediaImage}
                  />
                  <Text style={styles.mediaCaption}>Photo {index + 1}</Text>
                </>
              ) : (
                <AttachmentLabel
                  kind={item.kind}
                  text={item.fileName}
                  color={theme.textSecondary}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: spacing.lg,
  },
  contentFrame: {
    minWidth: 0,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  container: {
    minWidth: 0,
    gap: spacing.lg,
  },
  taskDocument: {
    minWidth: 0,
    width: "100%",
    gap: spacing.lg,
  },
  taskSummaryCard: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md + 2,
    gap: spacing.sm,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  summaryTopRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailLabelRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  taskTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  taskDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 4,
  },
  overviewCard: {
    minWidth: 0,
    padding: spacing.md + 2,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  overviewSectionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  taskTypeChip: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskSummaryLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  overviewDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  metaRow: {
    minWidth: 0,
    gap: 3,
    paddingVertical: 1,
  },
  metaLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaLabel: {
    color: theme.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 2,
    fontWeight: "700",
  },
  budgetRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: 4,
  },
  budgetLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    paddingBottom: 2,
  },
  budgetAmount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
  },
  checkpointCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  checkpointHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  checkpointState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkpointStateDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  checkpointStateText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  checkpointTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkpointTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  checkpointDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  checkpointFacts: {
    minWidth: 0,
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  checkpointFactsTablet: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: spacing.xs,
    paddingBottom: 0,
    gap: spacing.md,
  },
  checkpointFact: {
    minWidth: 0,
    gap: spacing.xs,
  },
  checkpointFactTablet: {
    flex: 1,
    paddingTop: 0,
    paddingRight: spacing.md,
    paddingBottom: 0,
  },
  checkpointFactSecondary: {},
  checkpointFactSecondaryTablet: {
    paddingRight: 0,
    paddingLeft: spacing.md,
  },
  checkpointFactLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  checkpointFactValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },
  checkpointAction: {
    paddingTop: spacing.xs,
  },
  accessCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  accessHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  accessTitle: {
    flex: 1,
    minWidth: 0,
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
  accessStateTextPublic: {
    color: theme.successOnSoft,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  accessIntroduction: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  accessTable: {
    minWidth: 0,
    overflow: "hidden",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  accessDetailBlock: {
    minWidth: 0,
    gap: spacing.xs,
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
  accessRowDivider: {
    height: 0,
  },
  accessPolicy: {
    minWidth: 0,
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  accessPolicyLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  accessPolicyText: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 3,
  },
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
  },
  sectionHeadingRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionHeading: {
    minWidth: 0,
    minHeight: 24,
    flex: 1,
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
    marginTop: spacing.sm,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  sectionDivider: {
    height: 0,
  },
  infoText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  mediaEmpty: {
    minWidth: 0,
    gap: spacing.xs,
  },
  mediaGrid: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  mediaItem: {
    minWidth: 0,
    gap: spacing.xs,
  },
  mediaFileItem: {
    minHeight: 88,
    justifyContent: "center",
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  mediaImage: {
    borderRadius: radii.md,
  },
  mediaCaption: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
  footnote: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  actionCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.primarySoft,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  actionHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  actionDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  errorBanner: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorBannerText: {
    minWidth: 0,
    flex: 1,
    color: theme.errorOnSoft,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  actionFooter: {
    minWidth: 0,
    width: "100%",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  actionFooterInner: {
    minWidth: 0,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  footerContext: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  footerEyebrow: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  footerTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  footerActions: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  footerActionsTablet: {
    width: 378,
    flexShrink: 0,
  },
  editAction: {
    minWidth: 0,
    flex: 0.85,
  },
  editActionTablet: {
    flex: 0,
    width: 150,
  },
  primaryAction: {
    minWidth: 0,
    flex: 1.15,
  },
  primaryActionTablet: {
    flex: 0,
    width: 220,
  },
});


