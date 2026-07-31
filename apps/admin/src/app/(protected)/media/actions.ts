"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function moderateTaskMediaAction(input: {
  mediaId: string;
  action: "approve" | "hide";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required to moderate an attachment." };
  }
  const repository = getAdminRepository();
  const result = await repository.moderateTaskMedia({
    mediaId: input.mediaId,
    action: input.action,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) {
    revalidatePath("/media");
    revalidatePath("/tasks");
  }
  return result;
}
