"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function requestRefundAction(input: {
  paymentIntentId: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  const repository = getAdminRepository();
  const result = await repository.requestRefund({
    paymentIntentId: input.paymentIntentId,
    reason: input.reason.trim(),
    actor: session.email,
    idempotencyKey: `refund-${input.paymentIntentId}-${Date.now()}`,
  });
  if (result.ok) revalidatePath(`/payments/${input.paymentIntentId}`);
  return result;
}

export async function freezePaymentAction(input: {
  paymentIntentId: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  const repository = getAdminRepository();
  // Deterministic idempotency key: one freeze per payment intent per Admin
  // session action. Retrying the exact same freeze is a safe no-op.
  const idempotencyKey = `freeze-${input.paymentIntentId}`;
  const result = await repository.freezePaymentIntent({
    paymentIntentId: input.paymentIntentId,
    reason: input.reason.trim(),
    actor: session.email,
    capability: session.capabilities[0] ?? null,
    idempotencyKey,
  });
  if (result.ok) {
    revalidatePath("/payments");
    revalidatePath(`/payments/${input.paymentIntentId}`);
  }
  return result;
}
