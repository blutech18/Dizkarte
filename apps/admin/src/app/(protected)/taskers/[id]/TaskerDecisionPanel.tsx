"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideTaskerApplicationAction } from "../actions";
import { taskerDecisionsFor, type TaskerApplicationDecision } from "../status";

/**
 * Decision controls for a Tasker application.
 *
 * Which buttons appear is derived from the current status (see
 * `taskerDecisionsFor`), so the panel never offers a decision that would be a
 * no-op. Every decision requires a written reason, which is what the applicant
 * sees and what lands in the moderation record.
 */
export function TaskerDecisionPanel({
  applicationId,
  currentStatus,
}: {
  readonly applicationId: string;
  readonly currentStatus: string;
}) {
  const router = useRouter();
  const options = taskerDecisionsFor(currentStatus);

  async function decide(decision: TaskerApplicationDecision, reason: string) {
    const result = await decideTaskerApplicationAction({ applicationId, decision, reason });
    if (result.ok) router.refresh();
    return result;
  }

  if (options.length === 0) return null;

  return (
    <div className="dk-tasker-decision-actions">
      {options.map((option) => (
        <ConfirmDialog
          key={option.label}
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
