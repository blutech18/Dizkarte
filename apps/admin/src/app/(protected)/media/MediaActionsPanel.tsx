"use client";

import type { SVGProps } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MediaModerationStatus } from "@/lib/repository/types";
import { moderateTaskMediaAction } from "./actions";

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

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
    <div className="dk-media-decision-actions">
      <ConfirmDialog
        triggerLabel="Approve"
        triggerVariant="secondary"
        triggerClassName="dk-action-btn dk-action-btn-approve"
        triggerIcon={<CheckIcon width={13} height={13} aria-hidden="true" />}
        title="Approve this attachment"
        description="The attachment stays visible on the task listing. Your decision and reason are recorded against your Admin account."
        confirmLabel="Approve"
        requireReason
        disabled={status === "APPROVED"}
        disabledReasonPresentation="tooltip"
        {...(status === "APPROVED" ? { disabledReason: "Already approved." } : {})}
        onConfirm={(reason) => run("approve", reason)}
      />
      <ConfirmDialog
        triggerLabel="Hide"
        triggerVariant="destructive"
        triggerClassName="dk-action-btn dk-action-btn-destructive"
        triggerIcon={<EyeOffIcon width={13} height={13} aria-hidden="true" />}
        title="Hide this attachment"
        description="The attachment is removed from the task listing. The rest of the task and its other attachments are untouched."
        confirmLabel="Hide"
        variant="destructive"
        requireReason
        disabled={status === "HIDDEN" || !previewAvailable}
        disabledReasonPresentation="tooltip"
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
