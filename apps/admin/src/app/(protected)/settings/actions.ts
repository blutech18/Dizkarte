"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import type { EditableSettingKey } from "@/lib/repository/types";

export async function updateSettingAction(input: {
  key: EditableSettingKey;
  value: number;
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPER"]);
  const repository = getAdminRepository();
  const result = await repository.updateSetting({
    key: input.key,
    value: input.value,
    reason: input.reason,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) revalidatePath("/settings");
  return result;
}
