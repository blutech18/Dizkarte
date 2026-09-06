"use client";

import type { SVGProps } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LinkButton } from "@/components/ui/Button";
import { setUserAccountStatusAction } from "./actions";

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

export function UserRowActions({
  userId,
  status,
  className,
  showProfileLink = false,
}: {
  readonly userId: string;
  readonly status: string;
  readonly className?: string;
  readonly showProfileLink?: boolean;
}) {
  const router = useRouter();

  async function setStatus(next: "active" | "suspended" | "banned", reason: string) {
    const result = await setUserAccountStatusAction({ userId, status: next, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className={className ?? "dk-row"}>
      {showProfileLink ? (
        <LinkButton
          href={`/users/${userId}`}
          size="sm"
          variant="secondary"
          className="dk-action-btn dk-action-btn-case"
          title="View and manage user account"
        >
          <UserIcon width={13} height={13} aria-hidden="true" />
          <span>Profile</span>
        </LinkButton>
      ) : null}
      {status !== "suspended" ? (
        <ConfirmDialog
          triggerLabel="Suspend"
          triggerVariant="secondary"
          title="Suspend user"
          description="The user will be unable to sign in or take marketplace actions until reinstated."
          confirmLabel="Suspend"
          requireReason
          onConfirm={(reason) => setStatus("suspended", reason)}
        />
      ) : (
        <ConfirmDialog
          triggerLabel="Reactivate"
          triggerVariant="secondary"
          title="Reactivate user"
          description="The user will regain normal account access."
          confirmLabel="Reactivate"
          requireReason
          onConfirm={(reason) => setStatus("active", reason)}
        />
      )}
      {status !== "banned" ? (
        <ConfirmDialog
          triggerLabel="Ban"
          triggerVariant="destructive"
          variant="destructive"
          title="Ban user"
          description="This is a severe, auditable action. The user will permanently lose account access unless reversed by a Super Admin."
          confirmLabel="Ban"
          requireReason
          onConfirm={(reason) => setStatus("banned", reason)}
        />
      ) : null}
    </div>
  );
}
