"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function decideVerificationAction(input: {
  caseId: string;
  decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this decision." };
  }
  const repository = getAdminRepository();
  const result = await repository.decideVerificationCase({
    caseId: input.caseId,
    decision: input.decision,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) {
    revalidatePath("/verification");
    revalidatePath(`/verification/${input.caseId}`);
  }
  return result;
}
