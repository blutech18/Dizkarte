"use client";

import type { SVGProps } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LinkButton } from "@/components/ui/Button";
import { moderateTaskAction } from "./actions";

function EyeIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function TaskRowActions({
  taskId,
  status,
  className,
  showViewLink = false,
}: {
  readonly taskId: string;
  readonly status: string;
  readonly className?: string;
  readonly showViewLink?: boolean;
}) {
  const router = useRouter();

  async function moderate(action: "remove" | "restore", reason: string) {
    const result = await moderateTaskAction({ taskId, action, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className={className ?? "dk-row"} style={{ gap: 8, justifyContent: "center" }}>
      {showViewLink ? (
        <LinkButton
          href={`/tasks/${taskId}`}
          size="sm"
          variant="secondary"
          className="dk-action-btn dk-action-btn-case"
          title="View task details"
        >
          <EyeIcon width={13} height={13} aria-hidden="true" />
          <span>View</span>
        </LinkButton>
      ) : null}
      {status === "REMOVED" ? (
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
      )}
    </div>
  );
}
