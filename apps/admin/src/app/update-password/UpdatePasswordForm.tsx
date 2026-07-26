"use client";

import { useActionState } from "react";
import { updatePasswordAction, type UpdatePasswordState } from "./actions";
import { LockIcon } from "@/components/shell/icons";

const initialState: UpdatePasswordState = { error: null };

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);

  return (
    <form
      action={formAction}
      className="dk-stack"
      aria-describedby={state.error ? "update-password-error" : undefined}
    >
      {state.error ? (
        <p id="update-password-error" role="alert" className="dk-field-error">
          {state.error}
        </p>
      ) : null}
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor="password">
          New password
        </label>
        <div className="dk-input-icon-wrap">
          <LockIcon width={18} height={18} aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="dk-input"
            aria-describedby="password-hint"
          />
        </div>
        <span className="dk-field-description" id="password-hint">
          At least 10 characters.
        </span>
      </div>
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor="confirm">
          Confirm new password
        </label>
        <div className="dk-input-icon-wrap">
          <LockIcon width={18} height={18} aria-hidden="true" />
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
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
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
