"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideVerificationAction } from "../actions";
import { verificationDecisionsFor, type VerificationDecision } from "../status";

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

  return (
    <div className="dk-verification-decision-actions">
      {options.map((option) => (
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
      ))}
    </div>
  );
}
