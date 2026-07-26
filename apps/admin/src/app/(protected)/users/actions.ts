"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function setUserAccountStatusAction(input: {
  userId: string;
  status: "active" | "suspended" | "banned";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this action." };
  }
  const repository = getAdminRepository();
  const result = await repository.setUserAccountStatus({
    userId: input.userId,
    status: input.status,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) revalidatePath("/users");
  return result;
}
