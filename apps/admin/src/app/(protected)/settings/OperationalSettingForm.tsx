"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EditableSetting } from "@/lib/repository/types";
import { updateSettingAction } from "./actions";

/**
 * Operational setting editor (super Admin only).
 *
 * Only allow-listed operational settings are editable; the server RPC re-checks
 * the key, the ADMIN_SUPER capability, bounds, and audits the change.
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
  const invalid = !Number.isInteger(parsed) || parsed < setting.min || parsed > setting.max;
  const unchanged = parsed === setting.value;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (reason.trim().length === 0) {
          setError("A reason is required; it is recorded in the audit log.");
          return;
        }
        if (invalid) {
          setError(`Enter a whole number between ${setting.min} and ${setting.max}.`);
          return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        const result = await updateSettingAction({ key: setting.key, value: parsed, reason });
        setPending(false);
        if (result.ok) {
          setSuccess("Setting updated successfully.");
          setReason("");
          router.refresh();
        } else {
          setError(result.message ?? "Could not update this setting. Please try again.");
        }
      }}
      style={{
        background: "var(--dk-surfaceSubtle)",
        border: "1px solid var(--dk-borderSubtle)",
        borderRadius: "var(--dk-radius-sm)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--dk-errorSoft)",
            border: "1px solid var(--dk-errorSolid)",
            color: "var(--dk-errorOnSoft, #9F1833)",
            borderRadius: "var(--dk-radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          style={{
            background: "var(--dk-successSoft)",
            border: "1px solid var(--dk-successSolid)",
            color: "var(--dk-successOnSoft, #0F6B46)",
            borderRadius: "var(--dk-radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {success}
        </div>
      ) : null}

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <label
            htmlFor={valueId}
            style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dk-textPrimary)" }}
          >
            {setting.label}
          </label>
          <span
            style={{
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              fontWeight: 600,
              color: "var(--dk-textSecondary)",
              background: "var(--dk-surface)",
              padding: "2px 8px",
              borderRadius: "var(--dk-radius-sm)",
              border: "1px solid var(--dk-borderSubtle)",
            }}
          >
            Current: {setting.value} {setting.unit}
          </span>
        </div>
        <p style={{ margin: "0 0 12px 0", fontSize: 12.5, color: "var(--dk-textSecondary)", lineHeight: 1.45 }}>
          {setting.description}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              id={valueId}
              className="dk-input"
              style={{
                width: 90,
                padding: "6px 10px",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
              }}
              type="number"
              inputMode="numeric"
              value={value}
              required
              min={setting.min}
              max={setting.max}
              step={1}
              onChange={(event) => setValue(event.target.value)}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dk-textSecondary)" }}>
              {setting.unit}
            </span>
          </div>

          <span style={{ fontSize: 12, color: "var(--dk-textSecondary)", fontFamily: "ui-monospace, monospace" }}>
            (Allowed range: {setting.min} – {setting.max} {setting.unit})
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label
            htmlFor={reasonId}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--dk-textPrimary)" }}
          >
            Audit justification {!unchanged ? <span style={{ color: "var(--dk-errorSolid, #B4233B)" }}>*</span> : null}
          </label>
          <span style={{ fontSize: 11.5, color: "var(--dk-textSecondary)" }}>
            Permanently logged
          </span>
        </div>
        <textarea
          id={reasonId}
          className="dk-textarea"
          rows={2}
          placeholder={unchanged ? "Change value above to submit an audited threshold update..." : "Describe the operational reason for this threshold change..."}
          value={reason}
          disabled={unchanged}
          onChange={(event) => setReason(event.target.value)}
          style={{
            fontSize: 13,
            resize: "vertical",
            minHeight: 52,
            background: unchanged ? "var(--dk-surface)" : "var(--dk-surface)",
            opacity: unchanged ? 0.7 : 1,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        {!unchanged ? (
          <button
            type="button"
            className="dk-btn dk-btn-secondary"
            style={{ fontSize: 12.5, padding: "6px 14px" }}
            onClick={() => {
              setValue(String(setting.value));
              setReason("");
              setError(null);
            }}
          >
            Reset
          </button>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={unchanged || invalid}
          style={{ fontSize: 12.5, padding: "6px 16px" }}
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}
