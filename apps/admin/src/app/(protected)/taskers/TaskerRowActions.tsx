import type { SVGProps } from "react";
import { LinkButton } from "@/components/ui/Button";
import { isAwaitingAdminDecision } from "./status";

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

function UserIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function TaskerRowActions({
  applicationId,
  userId,
  status,
}: {
  readonly applicationId: string;
  readonly userId?: string | undefined;
  readonly status: string;
}) {
  const isPending = isAwaitingAdminDecision(status);

  return (
    <div className="dk-table-actions">
      <LinkButton
        href={`/taskers/${applicationId}`}
        size="sm"
        variant={isPending ? "primary" : "secondary"}
        className="dk-action-btn dk-action-btn-case"
        title={isPending ? "Review tasker application and documents" : "View tasker application"}
      >
        <EyeIcon width={13} height={13} aria-hidden="true" />
        <span>{isPending ? "Review" : "View"}</span>
      </LinkButton>

      {userId ? (
        <LinkButton
          href={`/users/${userId}`}
          size="sm"
          variant="secondary"
          className="dk-action-btn dk-action-btn-case dk-action-btn-muted"
          title="View and manage user account"
        >
          <UserIcon width={13} height={13} aria-hidden="true" />
          <span>Account</span>
        </LinkButton>
      ) : null}
    </div>
  );
}
