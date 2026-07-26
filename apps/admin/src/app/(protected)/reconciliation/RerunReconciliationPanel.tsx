"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { rerunReconciliationAction } from "./actions";

/**
 * Auditable, deterministic, idempotent reconciliation re-run. It makes no
 * network or provider call: classifications are recomputed from the current
 * payment, provider-event, and ledger rows. Requires an explicit reason; the
 * idempotency key defaults to a stable per-session value but is editable so a
 * deliberate retry with the same key is provably a no-op.
 */
export function RerunReconciliationPanel({ synthetic }: { readonly synthetic: boolean }) {
  const router = useRouter();
  const keyId = useId();
  const [idempotencyKey, setIdempotencyKey] = useState(() => `rerun-${Date.now()}`);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const sourceLabel = synthetic
    ? "the current in-memory synthetic ledger, payment, and provider-event state"
    : "the current Supabase ledger, payment, and provider-event rows";

  return (
    <div className="dk-card" role="group" aria-label="Re-run reconciliation">
      <p className="dk-muted" style={{ marginTop: 0 }}>
        {synthetic
          ? "DEVELOPMENT SYNTHETIC action. No network or live provider call is made."
          : "Read-only recomputation. No network or live provider call is made and no record is rewritten."}
      </p>
      <div className="dk-field" style={{ maxWidth: 320 }}>
        <label className="dk-label" htmlFor={keyId}>
          Idempotency key
        </label>
        <input
          id={keyId}
          className="dk-input"
          type="text"
          value={idempotencyKey}
          onChange={(event) => setIdempotencyKey(event.target.value)}
        />
        <span className="dk-field-description">
          Re-running with the same key is a safe no-op retry.
        </span>
      </div>
      <ConfirmDialog
        triggerLabel="Re-run reconciliation"
        triggerVariant="secondary"
        title="Re-run reconciliation"
        description={`This recomputes MATCHED/DUPLICATE/QUARANTINED/MISMATCH/UNMATCHED classifications from ${sourceLabel}. It makes no network or provider call.`}
        confirmLabel="Re-run"
        requireReason
        onConfirm={async (reason) => {
          const result = await rerunReconciliationAction({ reason, idempotencyKey });
          if (result.ok) {
            setLastMessage(
              result.summary
                ? `Recomputed: ${result.summary.matched} matched, ${result.summary.duplicate} duplicate, ${result.summary.quarantined} quarantined, ${result.summary.mismatch} mismatch, ${result.summary.unmatched} unmatched.`
                : "Reconciliation re-run recorded.",
            );
            router.refresh();
          }
          return result;
        }}
      />
      {lastMessage ? (
        <p role="status" className="dk-field-description">
          {lastMessage}
        </p>
      ) : null}
    </div>
  );
}
