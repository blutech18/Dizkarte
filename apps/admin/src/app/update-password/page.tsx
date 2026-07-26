import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

/**
 * Set-new-password screen, reached from the emailed recovery link after
 * `/auth/confirm` has exchanged the one-time token for a short-lived session.
 *
 * Landing here without that session means the link was never used, has expired,
 * or was already consumed, so the page explains that instead of showing a form
 * that cannot work.
 */
export default async function UpdatePasswordPage() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();

  if (!data.user) {
    return (
      <>
        <PublicHeader variant="login" />
        <main id="dk-main-content" className="dk-auth-shell">
          <div className="dk-auth-card">
            <h1 className="dk-auth-title">This link is no longer valid</h1>
            <p className="dk-auth-subtitle">
              Password reset links can only be used once and expire quickly. Request a new one to
              continue.
            </p>
            <Link
              className="dk-btn dk-btn-primary"
              href="/reset-password"
              style={{ textAlign: "center", width: "100%" }}
            >
              Request a new link
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PublicHeader variant="login" />
      <main id="dk-main-content" className="dk-auth-shell">
        <div className="dk-auth-card">
          <div className="dk-auth-logo">
            <img src="/brand/text-icon-logo.png" alt="Dizkarte" />
          </div>
          <h1 className="dk-auth-title">Set a new password</h1>
          <p className="dk-auth-subtitle">Choose a new password for your Admin account.</p>
          <UpdatePasswordForm />
        </div>
      </main>
    </>
  );
}
