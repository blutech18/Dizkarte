import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Stack, router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import {
  EMPTY_TASK_DRAFT_FORM,
  TaskDraftForm,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "../../src/components/task/TaskDraftForm";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { theme, fontSize } from "../../src/theme";

/**
 * Create -> preview -> publish flow (new task).
 *
 * The in-progress draft lives in this screen's state while being edited. On
 * "Continue to preview" it is saved as a `DRAFT`-status `OwnedTaskRecord` via
 * the shared marketplace repository, so the draft survives navigating to the
 * preview/edit screens and back — the repository, not local component state,
 * is the source of truth once a draft has been saved once.
 */
export default function CreateTaskScreen() {
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [form, setForm] = useState<TaskDraftFormValue>(EMPTY_TASK_DRAFT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = useCallback(async () => {
    const result = validateTaskDraftForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!session) return;
    setSubmitting(true);
    try {
      const saved = await repository.saveDraftTask(session.userId, result.draft);
      notifyChanged();
      router.push({ pathname: "/task/[id]/preview", params: { id: saved.id } });
    } finally {
      setSubmitting(false);
    }
  }, [form, repository, session, notifyChanged]);

  if (!session) {
    return (
      <Screen>
        <Text style={styles.denied}>Sign in to post a task.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Post a task" }} />
      <TaskDraftForm value={form} onChange={setForm} errors={errors} />
      <Button label="Continue to preview" onPress={handleContinue} loading={submitting} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  denied: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
  },
});
