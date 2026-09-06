"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideVerificationAction } from "../actions";
import {
  verificationDecisionsFor,
  type VerificationDecision,
  type VerificationDecisionOption,
} from "../status";

export function VerificationDecisionPanel({
  caseId,
  currentStatus,
}: {
  readonly caseId: string;
  readonly currentStatus: string;
}) {
  const router = useRouter();
  const options = verificationDecisionsFor(currentStatus);

  async function decide(decision: VerificationDecision, reason: string) {
    const result = await decideVerificationAction({ caseId, decision, reason });
    if (result.ok) router.refresh();
    return result;
  }

  if (options.length === 0) return null;

  const approveOption = options.find((o) => o.decision === "APPROVED");
  const rejectOption = options.find((o) => o.decision === "REJECTED");
  const resubmitOption = options.find((o) => o.decision === "RESUBMISSION_REQUIRED");
  const otherOptions = options.filter(
    (o) =>
      o.decision !== "APPROVED" &&
      o.decision !== "REJECTED" &&
      o.decision !== "RESUBMISSION_REQUIRED",
  );

  function renderDialog(option: VerificationDecisionOption) {
    return (
      <ConfirmDialog
        key={option.decision}
        triggerLabel={option.label}
        triggerVariant={option.emphasis}
        {...(option.emphasis === "destructive" ? { variant: "destructive" as const } : {})}
        title={option.title}
        description={option.description}
        confirmLabel={option.label}
        requireReason
        onConfirm={(reason) => decide(option.decision, reason)}
      />
    );
  }

  return (
    <div className="dk-verification-decision-actions">
      <div className="dk-decision-btn-row">
        {approveOption ? renderDialog(approveOption) : null}
        {rejectOption ? renderDialog(rejectOption) : null}
      </div>
      {resubmitOption || otherOptions.length > 0 ? (
        <div className="dk-decision-btn-row">
          {resubmitOption ? renderDialog(resubmitOption) : null}
          {otherOptions.map(renderDialog)}
        </div>
      ) : null}
    </div>
  );
}
