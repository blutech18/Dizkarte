"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { rerunReconciliationAction } from "./actions";

/**
 * Auditable, deterministic reconciliation re-run control.
 *
 * Placed in the PageSection action slot to keep the main view clean and uncluttered.
 * Recomputes classifications from authoritative records without live provider or network calls.
 */
export function RerunReconciliationPanel({ synthetic }: { readonly synthetic: boolean }) {
  const router = useRouter();
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const sourceLabel = synthetic
    ? "the in-memory synthetic ledger, payment, and provider-event state"
    : "authoritative Supabase payment, provider-event, and ledger rows";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {lastMessage ? (
        <span
          role="status"
          className="dk-badge dk-badge-success"
          style={{ fontSize: 12, padding: "4px 8px" }}
        >
          {lastMessage}
        </span>
      ) : null}
      <ConfirmDialog
        triggerLabel="Re-run reconciliation"
        triggerVariant="secondary"
        title="Re-run reconciliation"
        description={`This recomputes MATCHED, DUPLICATE, QUARANTINED, MISMATCH, and UNMATCHED classifications from ${sourceLabel}. It makes no network or provider call and does not alter historical entries.`}
        confirmLabel="Re-run recomputation"
        requireReason
        onConfirm={async (reason) => {
          const idempotencyKey = `rerun-${Date.now()}`;
          const result = await rerunReconciliationAction({ reason, idempotencyKey });
          if (result.ok) {
            setLastMessage(
              result.summary
                ? `Recomputed: ${result.summary.matched} matched, ${result.summary.unmatched} unmatched`
                : "Reconciliation updated successfully.",
            );
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
