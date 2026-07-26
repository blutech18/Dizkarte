"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { moderateTaskAction } from "./actions";

export function TaskRowActions({
  taskId,
  status,
}: {
  readonly taskId: string;
  readonly status: string;
}) {
  const router = useRouter();

  async function moderate(action: "remove" | "restore", reason: string) {
    const result = await moderateTaskAction({ taskId, action, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return status === "REMOVED" ? (
    <ConfirmDialog
      triggerLabel="Restore"
      triggerVariant="secondary"
      title="Restore task"
      description="The task becomes eligible for public discovery again, subject to its normal state rules."
      confirmLabel="Restore"
      requireReason
      onConfirm={(reason) => moderate("restore", reason)}
    />
  ) : (
    <ConfirmDialog
      triggerLabel="Remove"
      triggerVariant="destructive"
      variant="destructive"
      title="Remove task from discovery"
      description="The task will be excluded from public search/feed results immediately."
      confirmLabel="Remove"
      requireReason
      onConfirm={(reason) => moderate("remove", reason)}
    />
  );
}
