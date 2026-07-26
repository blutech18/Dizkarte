"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function decideTaskerApplicationAction(input: {
  applicationId: string;
  decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this decision." };
  }
  const repository = getAdminRepository();
  const result = await repository.decideTaskerApplication({
    applicationId: input.applicationId,
    decision: input.decision,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) {
    revalidatePath("/taskers");
    revalidatePath(`/taskers/${input.applicationId}`);
  }
  return result;
}
