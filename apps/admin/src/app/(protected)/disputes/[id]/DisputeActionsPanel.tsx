"use client";

import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { disputeStatusLabel, DISPUTE_STATUS_TRANSITIONS } from "../status";
import { assignDisputeAction, transitionDisputeStatusAction } from "../actions";

export function DisputeActionsPanel({
  disputeId,
  status,
  assignee,
  actor,
}: {
  readonly disputeId: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly actor: string;
}) {
  const isAssignedToMe = assignee === actor;
  const allowedTransitions = DISPUTE_STATUS_TRANSITIONS[status] ?? [];

  return (
    <CaseActionsPanel
      isAssignedToMe={isAssignedToMe}
      isUnassigned={assignee === null}
      assignLabel="Assign to me"
      onAssign={() => assignDisputeAction({ disputeId })}
      allowedTransitions={allowedTransitions}
      transitionLabel={disputeStatusLabel}
      onTransition={(toStatus, reason) =>
        transitionDisputeStatusAction({
          disputeId,
          toStatus: toStatus as "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CANCELLED",
          reason,
        })
      }
    />
  );
}
