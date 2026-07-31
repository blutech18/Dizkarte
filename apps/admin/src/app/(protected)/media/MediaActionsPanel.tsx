"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MediaModerationStatus } from "@/lib/repository/types";
import { moderateTaskMediaAction } from "./actions";

export type MediaActionsPanelProps = {
  readonly mediaId: string;
  readonly status: MediaModerationStatus;
  /** Disables Hide when the reviewer could not load the image. */
  readonly previewAvailable: boolean;
};

/**
 * Approve or hide one attachment.
 *
 * Both actions are always offered rather than only the state-changing one: a
 * reviewer working a queue needs a consistent pair of buttons in the same place
 * on every row, and re-applying the current state is a harmless no-op server-side.
 *
 * Hide is blocked when the preview could not load. Hiding content you have not
 * seen is not a moderation decision, and the reason field would be fiction.
 */
export function MediaActionsPanel({ mediaId, status, previewAvailable }: MediaActionsPanelProps) {
  const router = useRouter();

  async function run(action: "approve" | "hide", reason: string) {
    const result = await moderateTaskMediaAction({ mediaId, action, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className="dk-row">
      <ConfirmDialog
        triggerLabel="Approve"
        triggerVariant="secondary"
        title="Approve this attachment"
        description="The attachment stays visible on the task listing. Your decision and reason are recorded against your Admin account."
        confirmLabel="Approve"
        requireReason
        disabled={status === "APPROVED"}
        {...(status === "APPROVED" ? { disabledReason: "Already approved." } : {})}
        onConfirm={(reason) => run("approve", reason)}
      />
      <ConfirmDialog
        triggerLabel="Hide"
        triggerVariant="destructive"
        title="Hide this attachment"
        description="The attachment is removed from the task listing. The rest of the task and its other attachments are untouched."
        confirmLabel="Hide"
        variant="destructive"
        requireReason
        disabled={status === "HIDDEN" || !previewAvailable}
        {...(status === "HIDDEN"
          ? { disabledReason: "Already hidden." }
          : !previewAvailable
            ? { disabledReason: "Load the preview before hiding an attachment." }
            : {})}
        onConfirm={(reason) => run("hide", reason)}
      />
    </div>
  );
}
