import type { Metadata } from "next";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ from?: string; notice?: string }>;
}) {
  const { from, notice } = await searchParams;

  return (
    <>
      <PublicHeader variant="login" />
      <main id="dk-main-content" className="dk-auth-shell">
        <div className="dk-auth-card">
          <div className="dk-auth-logo">
            <img src="/brand/text-icon-logo.png" alt="Dizkarte" style={{ height: 44, width: "auto" }} />
          </div>
          <h1 className="dk-auth-title">Admin Console Sign In</h1>
          <p className="dk-auth-subtitle">
            Protected internal system — an authorized Admin capability is required.
          </p>

          {notice === "link-invalid" ? (
            <div
              role="alert"
              className="dk-field-error"
              style={{
                marginBottom: 20,
                padding: "10px 14px",
                background: "var(--dk-errorSoft)",
                borderRadius: 10,
                border: "1px solid var(--dk-errorSoft)",
              }}
            >
              That password link has expired or was already used. Request a new password reset link below.
            </div>
          ) : null}

          <LoginForm from={from ?? "/dashboard"} />
        </div>
      </main>
    </>
  );
}
