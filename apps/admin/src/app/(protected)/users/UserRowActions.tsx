"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setUserAccountStatusAction } from "./actions";

export function UserRowActions({
  userId,
  status,
}: {
  readonly userId: string;
  readonly status: string;
}) {
  const router = useRouter();

  async function setStatus(next: "active" | "suspended" | "banned", reason: string) {
    const result = await setUserAccountStatusAction({ userId, status: next, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className="dk-row">
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
