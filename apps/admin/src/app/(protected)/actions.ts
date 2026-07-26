"use server";

import { signOut } from "@/lib/session";

export async function signOutAction(): Promise<void> {
  await signOut();
}
