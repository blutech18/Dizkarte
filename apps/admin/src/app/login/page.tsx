import type { Metadata } from "next";
import { DEV_ACCOUNT_PASSWORD, devAccountsFor } from "@dizkarte/config";
import { loadServerConfig, isDevAdapterActive } from "@/lib/config";
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
  const config = loadServerConfig();
  const devMode = isDevAdapterActive(config);

  return (
    <>
      <PublicHeader variant="login" />
      <main id="dk-main-content" className="dk-auth-shell">
        <div className="dk-auth-card">
          <div className="dk-auth-logo">
            <img src="/brand/text-icon-logo.png" alt="Dizkarte" />
          </div>
          <h1 className="dk-auth-title">Admin sign in</h1>
          <p className="dk-auth-subtitle">Protected console — an Admin capability is required.</p>

          {notice === "link-invalid" ? (
            <p role="alert" className="dk-field-error" style={{ marginBottom: 16 }}>
              That link has expired or was already used. Request a new password reset link to
              continue.
            </p>
          ) : null}

          {devMode ? (
            <div
              className="dk-badge dk-badge-warning"
              style={{ display: "block", marginBottom: 16, textAlign: "center" }}
            >
              Development environment — seeded test accounts, not production users
            </div>
          ) : null}

          <LoginForm from={from ?? "/dashboard"} />

          {/*
            Rendered only in development, and driven by the shared roster the
            seeder reads, so this list can never drift from the accounts that
            actually exist.
          */}
          {devMode ? (
            <div className="dk-auth-demo">
              <p className="dk-field-description" style={{ fontWeight: 700, marginBottom: 6 }}>
                Seeded Admin accounts (development only)
              </p>
              <ul
                className="dk-field-description"
                style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}
              >
                {devAccountsFor("admin").map((account) => (
                  <li key={account.email}>
                    <strong>{account.roleLabel}</strong> — {account.email}
                  </li>
                ))}
              </ul>
              <p className="dk-field-description" style={{ marginTop: 6, marginBottom: 0 }}>
                Password for every account: <code>{DEV_ACCOUNT_PASSWORD}</code>
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
