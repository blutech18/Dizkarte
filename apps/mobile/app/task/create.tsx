import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import {
  EMPTY_TASK_DRAFT_FORM,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "../../src/components/task/TaskDraftForm";
import { TaskWizard } from "../../src/components/task/TaskWizard";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useCategories } from "../../src/providers/CategoriesProvider";
import { theme, fontSize } from "../../src/theme";

/**
 * Guided create -> preview -> publish flow for a new task.
 *
 * The draft is collected one question at a time by `TaskWizard`; this screen owns
 * the in-progress value and the save. On submit it is written as a
 * `DRAFT`-status `OwnedTaskRecord` through the shared marketplace repository, so
 * the draft survives navigating to preview/edit and back — the repository, not
 * local state, is the source of truth once a draft has been saved.
 */
export default function CreateTaskScreen() {
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const { categories } = useCategories();

  const [form, setForm] = useState<TaskDraftFormValue>(EMPTY_TASK_DRAFT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Preselect the category a Client tapped on the home grid.
   *
   * Validated against the live catalog before being applied, so a stale or
   * hand-edited deep link cannot seed an id that would fail the
   * `tasks.category_id` foreign key on save. Applied once, and never over a
   * choice the user has already made.
   */
  const [categoryPreselected, setCategoryPreselected] = useState(false);
  const preselectApplied = useRef(false);
  useEffect(() => {
    if (preselectApplied.current) return;
    if (!category || categories.length === 0) return;
    if (!categories.some((option) => option.id === category)) return;
    preselectApplied.current = true;
    setCategoryPreselected(true);
    setForm((current) =>
      current.categoryId === null ? { ...current, categoryId: category } : current,
    );
  }, [category, categories]);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    setSubmitError(null);

    // The wizard already enforced every field, so a failure here means the
    // shared schema disagrees with a step rule — surface it rather than
    // silently dropping the user back to the start.
    const result = validateTaskDraftForm(form);
    if (!result.ok) {
      setSubmitError(Object.values(result.errors)[0] ?? "Please check your task details.");
      return;
    }

    setSubmitting(true);
    try {
      const saved = await repository.saveDraftTask(session.userId, result.draft);
      notifyChanged();
      router.replace({ pathname: "/task/[id]/preview", params: { id: saved.id } });
    } catch {
      setSubmitError("Could not save your task. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, repository, session, notifyChanged]);

  const handleExit = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  }, []);

  if (!session) {
    return (
      <Screen>
        <Text style={styles.denied}>Sign in to post a task.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      {/*
        The wizard supplies its own back control and progress bar, so the native
        header would duplicate both.
      */}
      <Stack.Screen options={{ headerShown: false }} />
      <TaskWizard
        value={form}
        onChange={setForm}
        categoryPreselected={categoryPreselected}
        onSubmit={handleSubmit}
        submitting={submitting}
        onExit={handleExit}
        submitError={submitError}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  denied: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
  },
});
