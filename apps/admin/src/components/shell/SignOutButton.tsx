"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/(protected)/actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="dk-btn dk-btn-secondary dk-btn-sm"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
          router.push("/login");
          router.refresh();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
