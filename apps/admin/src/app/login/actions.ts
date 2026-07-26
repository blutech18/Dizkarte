"use server";

import { redirect } from "next/navigation";
import { loginWithSupabase } from "@/lib/session";

export type LoginActionState = {
  readonly error: string | null;
};

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/dashboard");

  if (email.trim().length === 0 || password.length === 0) {
    return { error: "Enter both email and password." };
  }

  const result = await loginWithSupabase(email, password);
  if (!result.ok) {
    return { error: result.message };
  }
  redirect(from.startsWith("/") ? from : "/dashboard");
}
