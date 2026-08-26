import { useCallback, useEffect, useState } from "react";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { TEXT_LIMITS } from "@dizkarte/config";
import type { TaskId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { LoadingState } from "../../src/components/ui/AsyncState";
import {
  EMPTY_TASK_DRAFT_FORM,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "../../src/components/task/TaskDraftForm";
import { TaskWizard } from "../../src/components/task/TaskWizard";
import { categoryIdForTitle } from "../../src/components/task/taskCategoryQuestions";
import type { TaskQuestionDefinition } from "../../src/services/marketplace/types";
import type { PendingTaskPhoto } from "../../src/components/task/TaskPhotoPicker";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useCategories } from "../../src/providers/CategoriesProvider";
import {
  removeTaskMediaObjects,
  uploadTaskMediaBatch,
} from "../../src/services/storage/task-media-batch";

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
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { category, title: initialTitle } = useLocalSearchParams<{
    category?: string;
    title?: string;
  }>();
  const { categories } = useCategories();

  const [form, setForm] = useState<TaskDraftFormValue>(() => {
    const trimmed = initialTitle?.trim().slice(0, TEXT_LIMITS.taskTitleMax);
    return trimmed ? { ...EMPTY_TASK_DRAFT_FORM, title: trimmed } : EMPTY_TASK_DRAFT_FORM;
  });
  const [photos, setPhotos] = useState<ReadonlyArray<PendingTaskPhoto>>([]);
  const [questions, setQuestions] = useState<ReadonlyArray<TaskQuestionDefinition>>([]);
  /** How the current category was arrived at; see the effects below. */
  const [categorySource, setCategorySource] = useState<"param" | "title" | "default">("default");
  const [draftTaskId, setDraftTaskId] = useState<TaskId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    if (form.categoryId === null) {
      const match = category ? categories.find((option) => option.id === category) : undefined;
      const chosenId = match ? match.id : categories[0]!.id;
      // A tile tap is a deliberate choice; the first-catalogue fallback is not.
      setCategorySource(match ? "param" : "default");
      setForm((current) => ({
        ...current,
        categoryId: chosenId,
        // Arriving from a Home category tile should visibly reflect the choice:
        // seed Step 1's title with the category name so the field is pre-filled
        // and the Client refines it instead of facing a blank form. An explicit
        // ?title param (e.g. from the search box) or a title the user already
        // typed always wins and is never overwritten.
        title:
          match && current.title.trim().length === 0
            ? match.name.slice(0, TEXT_LIMITS.taskTitleMax)
            : current.title,
      }));
    }
  }, [category, categories, form.categoryId]);

  /**
   * Let the title choose the category, so typing "Help me move home" brings up
   * the removals questions without the Client picking a category first.
   *
   * Skipped when they arrived from a category tile, which is an explicit choice.
   * Answers are cleared whenever the effective category changes, because they
   * are keyed by the previous category's question ids.
   */
  useEffect(() => {
    if (categorySource === "param" || categories.length === 0) return;
    const detected = categoryIdForTitle(form.title, categories);
    if (detected) {
      if (detected !== form.categoryId) {
        setForm((current) => ({ ...current, categoryId: detected, categoryAnswers: {} }));
      }
      setCategorySource("title");
      return;
    }
    // The title no longer points anywhere. Keep the category (a task must have
    // one) but stop treating it as a real signal, so we do not interrogate the
    // Client with another trade's questions.
    if (categorySource === "title") {
      setCategorySource("default");
      setForm((current) =>
        Object.keys(current.categoryAnswers).length > 0
          ? { ...current, categoryAnswers: {} }
          : current,
      );
    }
  }, [categories, form.title, form.categoryId, categorySource]);

  /**
   * The category's question set, straight from the catalogue.
   *
   * Only loaded when the category reflects a real signal — a category tile or
   * the title. Falling back to the first category in the catalogue is a
   * placeholder, not a classification, and asking its questions (some of which
   * are required) would block a task that has nothing to do with that trade.
   *
   * A failure leaves the list empty, which degrades the details step to the
   * description alone rather than blocking the post.
   */
  useEffect(() => {
    const categoryId = form.categoryId;
    if (!categoryId || categorySource === "default") {
      setQuestions([]);
      return;
    }
    let cancelled = false;
    repository
      .listCategoryQuestions(categoryId)
      .then((list) => {
        if (!cancelled) setQuestions(list);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, form.categoryId, categorySource]);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    setSubmitError(null);

    // The wizard already enforced every field, so a failure here means the
    // shared schema disagrees with a step rule — surface it rather than
    // silently dropping the user back to the start.
    const result = validateTaskDraftForm(form, { includeAnswers: true });
    if (!result.ok) {
      setSubmitError(Object.values(result.errors)[0] ?? "Please check your task details.");
      return;
    }

    setSubmitting(true);
    try {
      // Create the DRAFT row first so Storage RLS can prove that the second path
      // segment is a real task owned by this Client. A retry reuses the same row
      // instead of producing duplicate drafts.
      const base = await repository.saveDraftTask(
        session.userId,
        { ...result.draft, media: [] },
        draftTaskId ?? undefined,
      );
      setDraftTaskId(base.id);

      const uploaded = await uploadTaskMediaBatch({
        userId: session.userId,
        taskId: base.id,
        files: photos.map((photo) => ({
          uri: photo.uri,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          kind: "image" as const,
        })),
      });
      try {
        const saved =
          uploaded.length > 0
            ? await repository.saveDraftTask(
                session.userId,
                { ...result.draft, media: uploaded },
                base.id,
              )
            : base;
        notifyChanged();
        router.replace({ pathname: "/task/[id]/preview", params: { id: saved.id } });
      } catch (uploadError) {
        // A failed batch must not leave unbound private objects behind. The
        // valid DRAFT row stays in place for a safe retry.
        const cleanup = await removeTaskMediaObjects(uploaded);
        if (cleanup.failed.length > 0) {
          throw new Error(
            "Could not save the task, and some temporary uploads could not be cleaned up. Please try again.",
          );
        }
        throw uploadError;
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not save your task. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [draftTaskId, form, photos, repository, session, notifyChanged]);

  const handleExit = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  }, []);

  if (status === "loading") {
    return (
      <Screen>
        <LoadingState label="Loading" />
      </Screen>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
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
        photos={photos}
        onPhotosChange={setPhotos}
        onSubmit={handleSubmit}
        submitting={submitting}
        onExit={handleExit}
        submitError={submitError}
        questions={questions}
      />
    </Screen>
  );
}
