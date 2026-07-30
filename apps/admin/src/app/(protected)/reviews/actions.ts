"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

/**
 * Hide or restore a review.
 *
 * Capability is re-checked here and again inside `admin_moderate_review`; this
 * check only produces a clearer failure, the database remains the authority.
 */
export async function moderateReviewAction(input: {
  reviewId: string;
  action: "hide" | "restore";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT", "ADMIN_SUPER"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required to moderate a review." };
  }
  const repository = getAdminRepository();
  const result = await repository.moderateReview({
    reviewId: input.reviewId,
    action: input.action,
    reason: input.reason.trim(),
    actor: session.email,
  });
  if (result.ok) revalidatePath("/reviews");
  return result;
}
