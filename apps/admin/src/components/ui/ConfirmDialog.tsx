"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export type ConfirmDialogProps = {
  readonly triggerLabel: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly variant?: "primary" | "destructive";
  readonly requireReason?: boolean;
  readonly triggerVariant?: "primary" | "secondary" | "destructive" | "text";
  readonly triggerClassName?: string;
  readonly triggerIcon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  /**
   * Where the disabled reason is shown. `text` (default) renders it under the
   * button, which is right for a one-off control. A gallery repeats the same
   * control on every card, so `tooltip` keeps the reason reachable without
   * printing the same sentence a dozen times down the page.
   */
  readonly disabledReasonPresentation?: "text" | "tooltip";
  readonly onConfirm: (reason: string) => Promise<{ ok: boolean; message?: string }>;
};

/**
 * Confirmation dialog for sensitive/destructive Admin actions. Requires an
 * explicit confirm click and, when `requireReason` is set, a non-empty typed
 * reason before the action can be submitted (requirement: sensitive actions
 * require explicit confirmation and reason).
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "primary",
  requireReason = false,
  triggerVariant = "secondary",
  triggerClassName,
  triggerIcon,
  disabled = false,
  disabledReason,
  disabledReasonPresentation = "text",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  function close() {
    setOpen(false);
    setReason("");
    setError(null);
  }

  async function handleConfirm() {
    if (requireReason && reason.trim().length === 0) {
      setError("A reason is required for this action.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(reason.trim());
    setSubmitting(false);
    if (result.ok) {
      close();
    } else {
      setError(result.message ?? "The action failed. Please try again.");
    }
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-disabled={disabled || undefined}
      >
        {triggerIcon ? (
          <span style={{ display: "inline-flex", marginRight: 5, alignItems: "center" }}>
            {triggerIcon}
          </span>
        ) : null}
        {triggerLabel}
      </Button>
      {disabled && disabledReason && disabledReasonPresentation === "text" ? (
        <p className="dk-field-description">{disabledReason}</p>
      ) : null}
      {open && mounted ? createPortal(
        <div
          className="dk-overlay"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <div
            className="dk-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            ref={dialogRef}
            tabIndex={-1}
          >
            <h2 id={titleId} className="dk-dialog-title">
              {title}
            </h2>
            <p className="dk-dialog-body">{description}</p>
            {requireReason ? (
              <div className="dk-field">
                <label className="dk-label dk-required" htmlFor={reasonId}>
                  Reason
                </label>
                <textarea
                  id={reasonId}
                  className="dk-textarea"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={error ? "true" : undefined}
                  aria-describedby={error ? `${reasonId}-error` : undefined}
                />
                {error ? (
                  <p id={`${reasonId}-error`} className="dk-field-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : error ? (
              <p className="dk-field-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dk-dialog-actions">
              <Button variant="secondary" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button variant={variant} onClick={handleConfirm} loading={submitting}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

