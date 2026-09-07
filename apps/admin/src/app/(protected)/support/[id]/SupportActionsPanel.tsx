"use client";

import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { ticketStatusLabel, TICKET_STATUS_TRANSITIONS } from "../status";
import { assignTicketAction, transitionTicketStatusAction } from "../actions";

export function SupportActionsPanel({
  ticketId,
  status,
  assignee,
  actor,
}: {
  readonly ticketId: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly actor: string;
}) {
  const isAssignedToMe = assignee === actor;
  const allowedTransitions = TICKET_STATUS_TRANSITIONS[status] ?? [];

  return (
    <CaseActionsPanel
      isAssignedToMe={isAssignedToMe}
      isUnassigned={assignee === null}
      assignLabel="Assign to me"
      onAssign={() => assignTicketAction({ ticketId })}
      allowedTransitions={allowedTransitions}
      transitionLabel={ticketStatusLabel}
      onTransition={(toStatus, reason) =>
        transitionTicketStatusAction({
          ticketId,
          toStatus: toStatus as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED",
          reason,
        })
      }
    />
  );
}
