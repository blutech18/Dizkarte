"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { approveWithdrawalAction } from "./actions";

/**
 * Withdrawal row controls. All three live payout actions (Approve, Reserve,
 * Retry) are disabled with an explicit reason whenever no payout provider is
 * configured — `disabled`/`disabledReason` are always sourced from
 * `getFinanceProviderAvailability()` by the parent page, never hard-coded
 * here.
 */
export function WithdrawalRowActions({
  withdrawalId,
  disabled,
  disabledReason,
}: {
  readonly withdrawalId: string;
  readonly disabled: boolean;
  readonly disabledReason: string;
}) {
  const router = useRouter();

  return (
    <div className="dk-row">
      <ConfirmDialog
        triggerLabel="Approve"
        triggerVariant="primary"
        title="Approve withdrawal"
        description="This reserves the withdrawal amount for provider payout processing. This financial action is audited."
        confirmLabel="Approve"
        requireReason
        disabled={disabled}
        disabledReason={disabledReason}
        onConfirm={async (reason) => {
          const result = await approveWithdrawalAction({ withdrawalId, reason });
          if (result.ok) router.refresh();
          return result;
        }}
      />
      <ConfirmDialog
        triggerLabel="Reserve"
        triggerVariant="secondary"
        title="Reserve withdrawal"
        description="Reserving requires an approved payout provider integration."
        confirmLabel="Reserve"
        requireReason
        disabled={disabled}
        disabledReason={disabledReason}
        onConfirm={async (reason) => {
          const result = await approveWithdrawalAction({ withdrawalId, reason });
          if (result.ok) router.refresh();
          return result;
        }}
      />
      <ConfirmDialog
        triggerLabel="Retry"
        triggerVariant="secondary"
        title="Retry payout"
        description="Retrying requires an approved payout provider integration."
        confirmLabel="Retry"
        requireReason
        disabled={disabled}
        disabledReason={disabledReason}
        onConfirm={async (reason) => {
          const result = await approveWithdrawalAction({ withdrawalId, reason });
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </div>
  );
}
