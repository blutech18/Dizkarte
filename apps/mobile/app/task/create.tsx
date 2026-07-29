import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
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
import { useCategories } from "../../src/providers/CategoriesProvider";
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
  const { category } = useLocalSearchParams<{ category?: string }>();
  const { categories } = useCategories();

  const [form, setForm] = useState<TaskDraftFormValue>(EMPTY_TASK_DRAFT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /**
   * Preselect the category a Client tapped on the home grid.
   *
   * Validated against the live catalog before being applied, so a stale or
   * hand-edited deep link cannot seed an id that would fail the
   * `tasks.category_id` foreign key on save. Applied once, and never over a
   * choice the user has already made in the picker.
   */
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current) return;
    if (!category || categories.length === 0) return;
    if (!categories.some((option) => option.id === category)) return;
    preselected.current = true;
    setForm((current) =>
      current.categoryId === null ? { ...current, categoryId: category } : current,
    );
  }, [category, categories]);

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
