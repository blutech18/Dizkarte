"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { moderateReviewAction } from "./actions";

export type ReviewActionsPanelProps = {
  readonly reviewId: string;
  readonly status: "HIDDEN" | "REVEALED" | "MODERATED";
};

/**
 * Hide or restore one review.
 *
 * Only the action that can change something is offered: a hidden review shows
 * Restore, anything else shows Hide. Both require a typed reason, which is
 * written to `moderation_actions` and `audit_logs` so the decision is
 * attributable afterwards.
 */
export function ReviewActionsPanel({ reviewId, status }: ReviewActionsPanelProps) {
  const router = useRouter();
  const hidden = status === "MODERATED";

  return (
    <ConfirmDialog
      triggerLabel={hidden ? "Restore" : "Hide"}
      triggerVariant={hidden ? "secondary" : "destructive"}
      title={hidden ? "Restore this review" : "Hide this review"}
      description={
        hidden
          ? "The review becomes visible again and its score is added back to the reviewee's rating average."
          : "The review is hidden from the app and its score is withdrawn from the reviewee's rating average. This is recorded against your Admin account."
      }
      confirmLabel={hidden ? "Restore" : "Hide"}
      variant={hidden ? "primary" : "destructive"}
      requireReason
      onConfirm={async (reason) => {
        const result = await moderateReviewAction({
          reviewId,
          action: hidden ? "restore" : "hide",
          reason,
        });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
