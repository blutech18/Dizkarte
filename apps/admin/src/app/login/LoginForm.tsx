"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginActionState } from "./actions";
import { MailIcon, LockIcon } from "@/components/shell/icons";

const initialState: LoginActionState = { error: null };

export function LoginForm({ from }: { readonly from: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form
      action={formAction}
      className="dk-stack"
      aria-describedby={state.error ? "login-error" : undefined}
      style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}
    >
      <input type="hidden" name="from" value={from} />
      {state.error ? (
        <div
          id="login-error"
          role="alert"
          className="dk-field-error"
          style={{
            padding: "8px 12px",
            background: "var(--dk-errorSoft)",
            borderRadius: 8,
            border: "1px solid var(--dk-errorSoft)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{state.error}</span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="dk-field" style={{ margin: 0 }}>
          <label className="dk-label dk-required" htmlFor="email">
            Email Address
          </label>
          <div className="dk-input-icon-wrap">
            <MailIcon width={18} height={18} aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="dk-input"
              placeholder="admin@dizkarte.ph"
            />
          </div>
        </div>
        <div className="dk-field" style={{ margin: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <label className="dk-label dk-required" htmlFor="password" style={{ margin: 0 }}>
              Password
            </label>
            <Link href="/reset-password" style={{ fontSize: 12.5, fontWeight: 600 }}>
              Forgot password?
            </Link>
          </div>
          <div className="dk-input-icon-wrap">
            <LockIcon width={18} height={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="dk-input"
              placeholder="••••••••"
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto" }}>
        <button
          type="submit"
          className="dk-btn dk-btn-primary"
          disabled={pending}
          aria-busy={pending || undefined}
          style={{ width: "100%", height: 44, fontSize: 14.5 }}
        >
          {pending ? (
            <>
              <span className="dk-spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in to Console"
          )}
        </button>
      </div>
    </form>
  );
}
