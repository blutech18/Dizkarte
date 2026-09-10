"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EditableSetting } from "@/lib/repository/types";
import { updateSettingAction } from "./actions";

/**
 * Operational setting editor (super Admin only).
 *
 * Built with standard design system tokens (.dk-stack, .dk-field, .dk-label, .dk-input, .dk-textarea, .dk-btn).
 */
export function OperationalSettingForm({ setting }: { readonly setting: EditableSetting }) {
  const router = useRouter();
  const valueId = useId();
  const reasonId = useId();
  const [value, setValue] = useState(String(setting.value));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parsed = Number(value);
  const isNumber = !Number.isNaN(parsed) && Number.isInteger(parsed);
  const invalid = !isNumber || parsed < setting.min || parsed > setting.max;
  const unchanged = parsed === setting.value;

  const handleReset = () => {
    setValue(String(setting.value));
    setReason("");
    setError(null);
    setSuccess(null);
  };

  return (
    <form
      noValidate
      className="dk-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (reason.trim().length === 0) {
          setError(
            "An audit justification is required. It will be permanently recorded in the audit log.",
          );
          return;
        }
        if (invalid) {
          setError(`Please enter a whole number between ${setting.min} and ${setting.max}.`);
          return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        const result = await updateSettingAction({ key: setting.key, value: parsed, reason });
        setPending(false);
        if (result.ok) {
          setSuccess("Setting updated and committed to the audit trail.");
          setReason("");
          router.refresh();
        } else {
          setError(result.message ?? "Failed to update operational setting.");
        }
      }}
    >
      {/* Alert notifications */}
      {error ? (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "var(--dk-errorSoft)",
            border: "1px solid var(--dk-errorSolid)",
            color: "var(--dk-errorOnSoft, #9F1833)",
            borderRadius: "var(--dk-radius-sm)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            background: "var(--dk-successSoft)",
            border: "1px solid var(--dk-successSolid)",
            color: "var(--dk-successOnSoft, #0F6B46)",
            borderRadius: "var(--dk-radius-sm)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {success}
        </div>
      ) : null}

      {/* Field: Setting Value */}
      <div className="dk-field">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <label htmlFor={valueId} className="dk-label" style={{ fontWeight: 600, fontSize: 13.5 }}>
            {setting.label}
          </label>
          <span
            style={{
              fontSize: 12,
              color: "var(--dk-textSecondary)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            Current: {setting.value} {setting.unit}
          </span>
        </div>
        <p className="dk-field-description" style={{ margin: "0 0 10px 0" }}>
          {setting.description}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            id={valueId}
            className="dk-input"
            type="number"
            inputMode="numeric"
            value={value}
            required
            min={setting.min}
            max={setting.max}
            step={1}
            disabled={pending}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            style={{ width: 110, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            aria-describedby={`${valueId}-hint`}
          />
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--dk-textPrimary)" }}>
            {setting.unit}
          </span>
          <span id={`${valueId}-hint`} style={{ fontSize: 12, color: "var(--dk-textSecondary)" }}>
            (Allowed range: {setting.min} to {setting.max} {setting.unit})
          </span>
        </div>
      </div>

      {/* Field: Audit Justification */}
      <div className="dk-field">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <label
            htmlFor={reasonId}
            className="dk-label"
            style={{ fontWeight: 600, fontSize: 13.5 }}
          >
            Audit justification{" "}
            {!unchanged ? <span style={{ color: "var(--dk-errorSolid)" }}>*</span> : null}
          </label>
          <span style={{ fontSize: 11.5, color: "var(--dk-textSecondary)" }}>
            Immutable audit record
          </span>
        </div>
        <p className="dk-field-description" style={{ margin: "0 0 8px 0" }}>
          Provide an operational justification explaining the business rationale for modifying this
          threshold.
        </p>
        <textarea
          id={reasonId}
          className="dk-textarea"
          rows={3}
          placeholder={
            unchanged
              ? "Modify the threshold above to submit an audited change..."
              : "Enter the operational justification for this change..."
          }
          value={reason}
          disabled={unchanged || pending}
          onChange={(event) => setReason(event.target.value)}
          style={{ fontSize: 13, resize: "vertical", minHeight: 68 }}
        />
      </div>

      {/* Action Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
        }}
      >
        {!unchanged ? (
          <button
            type="button"
            className="dk-btn dk-btn-secondary"
            onClick={handleReset}
            disabled={pending}
          >
            Reset
          </button>
        ) : null}
        <Button type="submit" variant="primary" loading={pending} disabled={unchanged || pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
