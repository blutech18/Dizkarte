"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function assignTicketAction(input: {
  ticketId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  const repository = getAdminRepository();
  const result = await repository.assignCase({
    resourceType: "ticket",
    resourceId: input.ticketId,
    assignee: session.email,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/support");
    revalidatePath(`/support/${input.ticketId}`);
  }
  return result;
}

export async function transitionTicketStatusAction(input: {
  ticketId: string;
  toStatus: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this status change." };
  }
  const repository = getAdminRepository();
  const result = await repository.transitionCaseStatus({
    resourceType: "ticket",
    resourceId: input.ticketId,
    toStatus: input.toStatus,
    reason: input.reason.trim(),
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/support");
    revalidatePath(`/support/${input.ticketId}`);
  }
  return result;
}
