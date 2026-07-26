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
    >
      <input type="hidden" name="from" value={from} />
      {state.error ? (
        <p id="login-error" role="alert" className="dk-field-error">
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
      </div>
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor="password">
          Password
        </label>
        <div className="dk-input-icon-wrap">
          <LockIcon width={18} height={18} aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="dk-input"
          />
        </div>
      </div>
      <button
        type="submit"
        className="dk-btn dk-btn-primary"
        disabled={pending}
        aria-busy={pending || undefined}
        style={{ width: "100%" }}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p style={{ margin: 0, textAlign: "center" }}>
        <Link href="/reset-password">Forgot your password?</Link>
      </p>
    </form>
  );
}
