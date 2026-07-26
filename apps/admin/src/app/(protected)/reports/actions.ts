"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function assignReportAction(input: {
  reportId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  const repository = getAdminRepository();
  const result = await repository.assignCase({
    resourceType: "report",
    resourceId: input.reportId,
    assignee: session.email,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/reports");
    revalidatePath(`/reports/${input.reportId}`);
  }
  return result;
}

export async function transitionReportStatusAction(input: {
  reportId: string;
  toStatus: "TRIAGED" | "ACTIONED" | "DISMISSED";
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPPORT"]);
  if (input.reason.trim().length === 0) {
    return { ok: false, message: "A reason is required for this status change." };
  }
  const repository = getAdminRepository();
  const result = await repository.transitionCaseStatus({
    resourceType: "report",
    resourceId: input.reportId,
    toStatus: input.toStatus,
    reason: input.reason.trim(),
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/reports");
    revalidatePath(`/reports/${input.reportId}`);
  }
  return result;
}
