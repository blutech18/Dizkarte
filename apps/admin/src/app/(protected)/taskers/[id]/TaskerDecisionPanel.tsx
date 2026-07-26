"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideTaskerApplicationAction } from "../actions";

export function TaskerDecisionPanel({
  applicationId,
  currentStatus,
}: {
  readonly applicationId: string;
  readonly currentStatus: string;
}) {
  const router = useRouter();

  async function decide(
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED",
    reason: string,
  ) {
    const result = await decideTaskerApplicationAction({ applicationId, decision, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className="dk-row">
      <ConfirmDialog
        triggerLabel="Approve"
        triggerVariant="primary"
        title="Approve Tasker application"
        description="The applicant becomes an approved Tasker able to submit offers and take paid work."
        confirmLabel="Approve"
        requireReason
        onConfirm={(reason) => decide("APPROVED", reason)}
      />
      <ConfirmDialog
        triggerLabel="Request resubmission"
        triggerVariant="secondary"
        title="Request resubmission"
        description="The applicant will see this reason and can submit a corrected application."
        confirmLabel="Request resubmission"
        requireReason
        onConfirm={(reason) => decide("RESUBMISSION_REQUIRED", reason)}
      />
      <ConfirmDialog
        triggerLabel="Reject"
        triggerVariant="destructive"
        variant="destructive"
        title="Reject Tasker application"
        description="This is a final decision for this application."
        confirmLabel="Reject"
        requireReason
        onConfirm={(reason) => decide("REJECTED", reason)}
      />
      {currentStatus === "APPROVED" ? (
        <ConfirmDialog
          triggerLabel="Suspend"
          triggerVariant="destructive"
          variant="destructive"
          title="Suspend approved Tasker"
          description="The Tasker will be unable to submit new offers or start new paid work until reinstated."
          confirmLabel="Suspend"
          requireReason
          onConfirm={(reason) => decide("SUSPENDED", reason)}
        />
      ) : null}
    </div>
  );
}
