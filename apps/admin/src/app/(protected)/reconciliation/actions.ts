"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import type { ReconciliationSummary } from "@/lib/repository/types";

export async function rerunReconciliationAction(input: {
  reason: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; message?: string; summary?: ReconciliationSummary }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  if (input.idempotencyKey.trim().length === 0) {
    return { ok: false, message: "A safe idempotency key is required." };
  }
  const repository = getAdminRepository();
  const result = await repository.rerunReconciliation({
    reason: input.reason.trim(),
    actor: session.email,
    capability: session.capabilities[0] ?? null,
    idempotencyKey: input.idempotencyKey.trim(),
  });
  if (result.ok) revalidatePath("/reconciliation");
  return result;
}
