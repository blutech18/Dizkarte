"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAdminRepository } from "@/lib/repository";

export async function requestRefundAction(input: {
  paymentIntentId: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  // Dispatch through the payment-refund Edge Function: it records the intent via
  // the capability-checked admin_refund RPC (as this Admin) and asks the provider
  // to refund. Authoritative money movement happens only on the provider's
  // verified refund webhook (process_refund_event). A full refund of the intent
  // is requested when no explicit amount is given.
  const client = await createSupabaseServerClient();
  const { data, error } = await client.functions.invoke("payment-refund", {
    body: { paymentIntentId: input.paymentIntentId, reason: input.reason.trim() },
  });
  if (error) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Refund could not be dispatched." };
  }
  const result = data as {
    success?: boolean;
    data?: { status?: string; dispatched?: boolean; message?: string };
    error?: { message?: string };
  } | null;
  if (!result?.success) {
    return { ok: false, message: result?.error?.message ?? "Refund was rejected." };
  }
  revalidatePath(`/payments/${input.paymentIntentId}`);
  return {
    ok: true,
    message: result.data?.dispatched
      ? "Refund dispatched; it will finalize when the provider confirms."
      : (result.data?.message ?? "Refund recorded."),
  };
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
