import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { StatusBadge } from "../../../src/components/ui/StatusBadge";
import { AttachmentLabel } from "../../../src/components/ui/AttachmentLabel";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { isClient, isIdentityVerified } from "../../../src/services/session-types";
import { useCategories } from "../../../src/providers/CategoriesProvider";
import type { OwnedTaskRecord } from "../../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Preview-before-publish step.
 *
 * Shows exactly what public discovery will see (approximate location only)
 * alongside the private fields, plus an explicit verification-denial state
 * when the Client's identity is not yet approved — publishing is blocked,
 * not silently allowed.
 */
export default function PreviewTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { nameFor } = useCategories();
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

  if (!session) return <DeniedState description="Sign in to preview this task." />;
  if (state === "loading") return <LoadingState label="Loading preview" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !task) {
    return <DeniedState title="Task not found" description="This draft could not be loaded." />;
  }

  if (published) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Task published" }} />
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Your task is live</Text>
          <Text style={styles.successBody}>
            Approved Taskers nearby can now see it and submit offers.
          </Text>
        </View>
        <Button label="Go to My Tasks" onPress={() => router.replace("/(tabs)/work")} fullWidth />
      </Screen>
    );
  }

  const verified = isClient(session) && isIdentityVerified(session);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Preview" }} />

      {!verified ? (
        <View style={styles.denialBanner}>
          <StatusBadge tone="warning" label="Verification required" />
          <Text style={styles.denialText}>
            Your identity must be verified before this task can be published. You can still save it
            as a draft.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <StatusBadge tone="brand" label={nameFor(task.draft.categoryId) ?? "Task"} />
        <Text style={styles.title}>{task.draft.title || "Untitled task"}</Text>
        <Text style={styles.budget}>{formatPhp(task.draft.budgetCentavos || 0)}</Text>
        <Text style={styles.description}>{task.draft.description}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Public — visible to every Tasker</Text>
          <Text style={styles.sectionBody}>{task.draft.landmark || "No landmark set"}</Text>
          <Text style={styles.sectionBody}>
            {task.draft.sameDay ? "Same-day" : task.draft.scheduledFor || "Flexible schedule"}
          </Text>
        </View>

        <View style={[styles.section, styles.privateSection]}>
          <Text style={styles.sectionLabel}>Private — shared only after payment is confirmed</Text>
          <Text style={styles.sectionBody}>
            {task.draft.exactAddress || "No exact address set"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Media ({task.draft.media.length})</Text>
          {task.draft.media.length === 0 ? (
            <Text style={styles.sectionBody}>No attachments.</Text>
          ) : (
            task.draft.media.map((m) => (
              <AttachmentLabel key={m.id} kind={m.kind} text={m.fileName} />

            ))
          )}
        </View>
      </View>

      {publishError ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {publishError}
        </Text>
      ) : null}

      <Button
        label="Edit"
        variant="secondary"
        onPress={() => router.push({ pathname: "/task/[id]/edit", params: { id: task.id } })}
        fullWidth
      />
      <View style={{ height: spacing.sm }} />
      <Button
        label={verified ? "Publish task" : "Verification required to publish"}
        onPress={handlePublish}
        loading={publishing}
        disabled={!verified}
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: theme.textPrimary },
  budget: { fontSize: fontSize.lg, fontWeight: "700", color: theme.primary },
  description: { fontSize: fontSize.md, color: theme.textSecondary },
  section: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  privateSection: { backgroundColor: theme.warningSoft },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: "700", color: theme.textPrimary },
  sectionBody: { fontSize: fontSize.sm, color: theme.textPrimary },
  denialBanner: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  denialText: { color: theme.warningOnSoft, fontSize: fontSize.xs },
  successCard: {
    backgroundColor: theme.successSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  successTitle: { fontSize: fontSize.lg, fontWeight: "700", color: theme.successOnSoft },
  successBody: { fontSize: fontSize.sm, color: theme.successOnSoft },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
});
