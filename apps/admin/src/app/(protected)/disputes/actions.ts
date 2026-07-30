"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import type { ConversationTranscript } from "@/lib/repository/types";

export async function assignDisputeAction(input: {
  disputeId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  const repository = getAdminRepository();
  const result = await repository.assignCase({
    resourceType: "dispute",
    resourceId: input.disputeId,
    assignee: session.email,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/disputes");
    revalidatePath(`/disputes/${input.disputeId}`);
  }
  return result;
}

export async function transitionDisputeStatusAction(input: {
  disputeId: string;
  toStatus: "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CANCELLED";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this status change." };
  }
  const repository = getAdminRepository();
  const result = await repository.transitionCaseStatus({
    resourceType: "dispute",
    resourceId: input.disputeId,
    toStatus: input.toStatus,
    reason: input.reason.trim(),
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/disputes");
    revalidatePath(`/disputes/${input.disputeId}`);
  }
  return result;
}

/**
 * Read the booking conversation behind a dispute.
 *
 * No `revalidatePath`: this is a read, and the transcript is returned to the
 * caller rather than cached into the page. The audit entry is written by
 * `admin_read_conversation_messages` itself.
 */
export async function readDisputeConversationAction(input: {
  disputeId: string;
  reason: string;
}): Promise<ConversationTranscript> {
  const session = await requireAdminSession(["ADMIN_FINANCE"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required to read a conversation." };
  }
  const repository = getAdminRepository();
  return repository.readDisputeConversation({
    disputeId: input.disputeId,
    reason: input.reason.trim(),
    actor: session.email,
  });
}
