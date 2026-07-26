"use server";

import { redirect } from "next/navigation";
import { passwordSchema } from "@dizkarte/domain";
import { updateAdminPassword } from "@/lib/session";

export type UpdatePasswordState = {
  readonly error: string | null;
};

export async function updatePasswordAction(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid password." };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const result = await updateAdminPassword(password);
  if (!result.ok) {
    return { error: result.message };
  }
  // The recovery session is now an ordinary Admin session.
  redirect("/dashboard");
}
