"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideVerificationAction } from "../actions";

export function VerificationDecisionPanel({ caseId }: { readonly caseId: string }) {
  const router = useRouter();

  async function decide(
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED",
    reason: string,
  ) {
    const result = await decideVerificationAction({ caseId, decision, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div className="dk-row">
      <ConfirmDialog
        triggerLabel="Approve"
        triggerVariant="primary"
        title="Approve identity verification"
        description="The user becomes eligible for marketplace actions gated on verified identity. This action is audited."
        confirmLabel="Approve"
        requireReason
        onConfirm={(reason) => decide("APPROVED", reason)}
      />
      <ConfirmDialog
        triggerLabel="Request resubmission"
        triggerVariant="secondary"
        title="Request resubmission"
        description="The user will see this reason and can submit corrected documents."
        confirmLabel="Request resubmission"
        requireReason
        onConfirm={(reason) => decide("RESUBMISSION_REQUIRED", reason)}
      />
      <ConfirmDialog
        triggerLabel="Reject"
        triggerVariant="destructive"
        variant="destructive"
        title="Reject identity verification"
        description="This is a final decision. The user will not be able to resubmit this case."
        confirmLabel="Reject"
        requireReason
        onConfirm={(reason) => decide("REJECTED", reason)}
      />
    </div>
  );
}
