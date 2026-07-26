"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { freezePaymentAction, requestRefundAction } from "./actions";

/**
 * Refund/release and freeze controls for a payment intent detail page.
 *
 * Refund/release is visible but disabled: provider credentials and refund
 * policy are unapproved, so the repository returns `PROVIDER_UNAVAILABLE`
 * before any mutation. Freeze is a real privileged command (`admin_freeze`),
 * enabled and gated behind confirmation + reason.
 */
export function PaymentActionsPanel({
  paymentIntentId,
  freezeEligible,
  refundDisabledReason,
}: {
  readonly paymentIntentId: string;
  readonly freezeEligible: boolean;
  readonly refundDisabledReason: string;
}) {
  const router = useRouter();

  return (
    <div className="dk-row">
      <ConfirmDialog
        triggerLabel="Refund"
        triggerVariant="destructive"
        title="Refund payment"
        description="Refunds require an approved Philippine payment provider and refund policy. This control is disabled until that integration exists."
        confirmLabel="Refund"
        requireReason
        disabled
        disabledReason={refundDisabledReason}
        onConfirm={(reason) => requestRefundAction({ paymentIntentId, reason })}
      />
      <ConfirmDialog
        triggerLabel="Release"
        triggerVariant="secondary"
        title="Release payment"
        description="Releases require an approved Philippine payment provider. This control is disabled until that integration exists."
        confirmLabel="Release"
        requireReason
        disabled
        disabledReason={refundDisabledReason}
        onConfirm={(reason) => requestRefundAction({ paymentIntentId, reason })}
      />
      <ConfirmDialog
        triggerLabel="Freeze"
        triggerVariant="secondary"
        title="Freeze payment"
        description="Holds the booking pending review without rewriting any prior ledger entry. This action is audited with your identity, capability, reason, and timestamp."
        confirmLabel="Freeze"
        requireReason
        disabled={!freezeEligible}
        {...(!freezeEligible
          ? { disabledReason: "Only committed, unsettled payments can be frozen." }
          : {})}
        onConfirm={async (reason) => {
          const result = await freezePaymentAction({ paymentIntentId, reason });
          if (result.ok) router.refresh();
          return result;
        }}
      />
      <ConfirmDialog
        triggerLabel="Unfreeze"
        triggerVariant="secondary"
        title="Unfreeze payment"
        description="Unfreeze is unavailable — no approved unfreeze policy or privileged command exists yet."
        confirmLabel="Unfreeze"
        disabled
        disabledReason="No approved unfreeze policy or privileged command exists yet."
        onConfirm={async () => ({ ok: false, message: "Unfreeze is unavailable." })}
      />
    </div>
  );
}
