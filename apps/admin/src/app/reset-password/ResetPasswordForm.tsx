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
    >
      {state.error ? (
        <p id="reset-error" role="alert" className="dk-field-error">
          {state.error}
        </p>
      ) : null}
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor="email">
          Email
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
          />
        </div>
        <span className="dk-field-description">
          We will send a reset link to this address if it has Admin access.
        </span>
      </div>
      <button
        type="submit"
        className="dk-btn dk-btn-primary"
        disabled={pending}
        aria-busy={pending || undefined}
        style={{ width: "100%" }}
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link className="dk-btn dk-btn-secondary" href="/login" style={{ textAlign: "center" }}>
        Back to sign in
      </Link>
    </form>
  );
}
