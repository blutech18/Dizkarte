"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

export type CaseActionsPanelProps = {
  readonly isAssignedToMe: boolean;
  readonly isUnassigned: boolean;
  readonly assignLabel: string;
  readonly onAssign: () => Promise<{ ok: boolean; message?: string }>;
  readonly allowedTransitions: ReadonlyArray<string>;
  readonly transitionLabel: (status: string) => string;
  readonly onTransition: (
    toStatus: string,
    reason: string,
  ) => Promise<{ ok: boolean; message?: string }>;
};

/**
 * Shared assign-to-self + status-transition controls for report/dispute/
 * ticket detail pages. Every transition requires an explicit confirm and a
 * typed reason (requirement 4.6.5); assignment is a single confirmed action.
 */
export function CaseActionsPanel({
  isAssignedToMe,
  isUnassigned,
  assignLabel,
  onAssign,
  allowedTransitions,
  transitionLabel,
  onTransition,
}: CaseActionsPanelProps) {
  const router = useRouter();

  if (!isAssignedToMe) {
    return isUnassigned ? (
      <div className="dk-row">
        <AssignButton label={assignLabel} onAssign={onAssign} />
      </div>
    ) : null;
  }

  if (allowedTransitions.length === 0) {
    return <p className="dk-muted">This case has no further status transitions available.</p>;
  }

  return (
    <div className="dk-row">
      {allowedTransitions.map((status) => (
        <ConfirmDialog
          key={status}
          triggerLabel={transitionLabel(status)}
          triggerVariant="secondary"
          title={`Move to ${transitionLabel(status)}`}
          description="This status change is recorded with your identity, capability, reason, and timestamp in the audit log."
          confirmLabel="Confirm"
          requireReason
          onConfirm={async (reason) => {
            const result = await onTransition(status, reason);
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ))}
    </div>
  );
}

function AssignButton({
  label,
  onAssign,
}: {
  readonly label: string;
  readonly onAssign: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="primary"
        size="sm"
        loading={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await onAssign();
          setPending(false);
          if (result.ok) {
            router.refresh();
          } else {
            setError(result.message ?? "Could not assign this case. Please try again.");
          }
        }}
      >
        {label}
      </Button>
      {error ? (
        <p className="dk-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
