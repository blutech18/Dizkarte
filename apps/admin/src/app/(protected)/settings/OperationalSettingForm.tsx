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
      className="dk-stack"
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
          setSuccess("Setting updated.");
          setReason("");
          router.refresh();
        } else {
          setError(result.message ?? "Could not update this setting. Please try again.");
        }
      }}
    >
      {error ? (
        <p role="alert" className="dk-field-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="dk-field-description">
          {success}
        </p>
      ) : null}
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor={valueId}>
          {setting.label} ({setting.unit})
        </label>
        <span className="dk-field-description">{setting.description}</span>
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
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor={reasonId}>
          Reason
        </label>
        <span className="dk-field-description">
          Required for any change; recorded in the audit log.
        </span>
        <textarea
          id={reasonId}
          className="dk-textarea"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div>
        <Button type="submit" variant="primary" loading={pending} disabled={unchanged || invalid}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
