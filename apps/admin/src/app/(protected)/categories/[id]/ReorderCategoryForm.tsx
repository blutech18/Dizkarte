"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { reorderCategoryAction } from "../actions";

export function ReorderCategoryForm({
  categoryId,
  displayOrder,
}: {
  readonly categoryId: string;
  readonly displayOrder: number;
}) {
  const router = useRouter();
  const orderId = useId();
  const reasonId = useId();
  const [order, setOrder] = useState(String(displayOrder));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parsed = Number.parseInt(order, 10);
  const unchanged = parsed === displayOrder;

  return (
    <form
      className="dk-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!Number.isInteger(parsed) || parsed < 1) {
          setError("Display order must be a positive whole number.");
          return;
        }
        if (reason.trim().length === 0) {
          setError("A reason is required to reorder categories.");
          return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        const result = await reorderCategoryAction({
          categoryId,
          displayOrder: parsed,
          reason,
        });
        setPending(false);
        if (result.ok) {
          setSuccess("Display order updated.");
          setReason("");
          router.refresh();
        } else {
          setError(result.message ?? "Could not reorder this category. Please try again.");
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
        <label className="dk-label dk-required" htmlFor={orderId}>
          Display order
        </label>
        <input
          id={orderId}
          className="dk-input"
          type="number"
          min={1}
          step={1}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
        />
      </div>
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor={reasonId}>
          Reason
        </label>
        <span className="dk-field-description">
          Required for any order change; recorded in the audit log.
        </span>
        <textarea
          id={reasonId}
          className="dk-textarea"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div>
        <Button type="submit" variant="primary" loading={pending} disabled={unchanged}>
          Save order
        </Button>
      </div>
    </form>
  );
}
