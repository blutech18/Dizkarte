import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import {
  TaskDraftForm,
  draftFormFromInput,
  validateTaskDraftForm,
  type TaskDraftFormValue,
} from "../../../src/components/task/TaskDraftForm";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { MediaPicker } from "../../../src/components/media/MediaPicker";
import type { UploadedObject } from "../../../src/services/storage/upload";
import type { TaskMediaAttachment } from "../../../src/services/marketplace/types";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Bridge the picker's stored-object shape and the draft's attachment shape.
 *
 * `task_media` records neither size nor MIME type, so a row read back from the
 * database has zeroes for both. That is honest — nothing is invented — and the
 * picker only uses them for its own display.
 */
function toUploadedObject(media: TaskMediaAttachment): UploadedObject {
  return {
    bucket: "task-media",
    path: media.storagePath,
    fileName: media.fileName,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    kind: media.kind,
  };
}

function toTaskMediaAttachment(object: UploadedObject): TaskMediaAttachment {
  return {
    id: object.path,
    kind: object.kind === "video" ? "video" : "image",
    fileName: object.fileName,
    sizeBytes: object.sizeBytes,
    mimeType: object.mimeType,
    storagePath: object.path,
  };
}

/** Edit an existing owned task. Only reachable while the task is DRAFT or OPEN. */
export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [state, setState] = useState<LoadState>("loading");
  const [form, setForm] = useState<TaskDraftFormValue | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getOwnedTask(id as TaskId, session.userId)
      .then((task) => {
        if (!task) {
          setState("denied");
          return;
        }
        if (task.status !== "DRAFT" && task.status !== "OPEN") {
          setState("denied");
          return;
        }
        setForm(draftFormFromInput(task.draft));
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!session || !form) return;
    const result = validateTaskDraftForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const saved = await repository.saveDraftTask(session.userId, result.draft, id as TaskId);
      notifyChanged();
      router.push({ pathname: "/task/[id]/preview", params: { id: saved.id } });
    } finally {
      setSubmitting(false);
    }
  }, [form, id, repository, session, notifyChanged]);

  if (!session) return <DeniedState description="Sign in to edit this task." />;
  if (state === "loading") return <LoadingState label="Loading task" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !form) {
    return (
      <DeniedState
        title="Cannot edit this task"
        description="This task no longer belongs to you or is not editable in its current state."
      />
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Edit task" }} />
      <Text accessibilityRole="text" style={{ display: "none" }}>
        Editing task {id}
      </Text>
      <TaskDraftForm value={form} onChange={setForm} errors={errors} />
      {/*
        Photos are attached here rather than in the create wizard because the
        object path is scoped to the task id, which does not exist until the
        draft has been saved once.
      */}
      <MediaPicker
        bucket="task-media"
        userId={session.userId}
        scopeId={id}
        value={form.media.map(toUploadedObject)}
        onChange={(next) =>
          setForm({ ...form, media: next.map(toTaskMediaAttachment) })
        }
        label="Photos"
        hint="Show the work area so Taskers can quote accurately."
        allowVideo
        disabled={submitting}
      />
      <Button label="Continue to preview" onPress={handleSave} loading={submitting} fullWidth />
    </Screen>
  );
}
