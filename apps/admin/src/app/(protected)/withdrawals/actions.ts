"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function approveWithdrawalAction(input: {
  withdrawalId: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  const repository = getAdminRepository();
  const result = await repository.approveWithdrawal({
    withdrawalId: input.withdrawalId,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) revalidatePath("/withdrawals");
  return result;
}
