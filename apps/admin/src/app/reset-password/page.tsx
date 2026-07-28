import type { Metadata } from "next";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <>
      <PublicHeader variant="login" />
      <main id="dk-main-content" className="dk-auth-shell">
        <div className="dk-auth-card">
          <div className="dk-auth-logo">
            <img src="/brand/text-icon-logo.png" alt="Dizkarte" style={{ height: 44, width: "auto" }} />
          </div>
          <h1 className="dk-auth-title">Reset Your Password</h1>
          <p className="dk-auth-subtitle">
            Enter your Admin email address below to receive a secure password reset link.
          </p>
          <ResetPasswordForm />
        </div>
      </main>
    </>
  );
}
