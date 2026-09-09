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
          setSuccess("Display order updated successfully.");
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
        <p role="status" className="dk-field-description" style={{ color: "var(--dk-success)" }}>
          {success}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="dk-field">
          <label className="dk-label dk-required" htmlFor={orderId}>
            Sort position
          </label>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                color: "var(--dk-textSecondary)",
                fontWeight: 700,
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              #
            </span>
            <input
              id={orderId}
              className="dk-input"
              type="number"
              min={1}
              step={1}
              value={order}
              style={{ paddingLeft: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
              onChange={(event) => setOrder(event.target.value)}
            />
          </div>
          <span className="dk-field-description">
            Lower numbers appear first in customer menus.
          </span>
        </div>

        <div className="dk-field">
          <label className="dk-label dk-required" htmlFor={reasonId}>
            Reason for change
          </label>
          <input
            id={reasonId}
            className="dk-input"
            type="text"
            placeholder="e.g. Prioritizing seasonal category..."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="dk-field-description">
            Recorded in moderation audit log.
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 2,
        }}
      >
        <Button type="submit" variant="primary" loading={pending} disabled={unchanged}>
          Update display order
        </Button>
        <span style={{ fontSize: 13, color: "var(--dk-textSecondary)" }}>
          {parsed === displayOrder
            ? "Current position: #" + displayOrder
            : "Will change position: #" + displayOrder + " → #" + parsed}
        </span>
      </div>
    </form>
  );
}
