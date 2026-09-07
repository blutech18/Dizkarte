"use client";

import { CaseActionsPanel } from "@/components/ui/CaseActionsPanel";
import { reportStatusLabel, REPORT_STATUS_TRANSITIONS } from "../status";
import { assignReportAction, transitionReportStatusAction } from "../actions";

export function ReportActionsPanel({
  reportId,
  status,
  assignee,
  actor,
}: {
  readonly reportId: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly actor: string;
}) {
  const isAssignedToMe = assignee === actor;
  const allowedTransitions = REPORT_STATUS_TRANSITIONS[status] ?? [];

  return (
    <CaseActionsPanel
      isAssignedToMe={isAssignedToMe}
      isUnassigned={assignee === null}
      assignLabel="Assign to me"
      onAssign={() => assignReportAction({ reportId })}
      allowedTransitions={allowedTransitions}
      transitionLabel={reportStatusLabel}
      onTransition={(toStatus, reason) =>
        transitionReportStatusAction({
          reportId,
          toStatus: toStatus as "TRIAGED" | "ACTIONED" | "DISMISSED",
          reason,
        })
      }
    />
  );
}
