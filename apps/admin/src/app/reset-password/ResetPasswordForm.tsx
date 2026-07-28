"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestResetAction, type ResetRequestState } from "./actions";
import { MailIcon } from "@/components/shell/icons";

const initialState: ResetRequestState = { error: null, sent: false };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(requestResetAction, initialState);

  if (state.sent) {
    return (
      <div className="dk-stack">
        <p role="status" aria-live="polite">
          If that address belongs to an Admin account, a password reset link is on its way. The link
          expires shortly, so use it soon.
        </p>
        <Link className="dk-btn dk-btn-primary" href="/login" style={{ textAlign: "center" }}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="dk-stack"
      aria-describedby={state.error ? "reset-error" : undefined}
      style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}
    >
      {state.error ? (
        <div
          id="reset-error"
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
        <span className="dk-field-description" style={{ marginTop: 8, fontSize: 11.5, color: "var(--dk-textSecondary)", whiteSpace: "nowrap" }}>
          A secure recovery link will be sent if this email has Admin access.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
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
              Sending reset link…
            </>
          ) : (
            "Send Reset Link"
          )}
        </button>
        <Link className="dk-btn dk-btn-secondary" href="/login" style={{ textAlign: "center", width: "100%", height: 38, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
