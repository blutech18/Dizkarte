"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { renameCategoryAction } from "../actions";

export function RenameCategoryForm({
  categoryId,
  name: initialName,
  slug: initialSlug,
}: {
  readonly categoryId: string;
  readonly name: string;
  readonly slug: string;
}) {
  const router = useRouter();
  const nameId = useId();
  const slugId = useId();
  const reasonId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const unchanged = name.trim() === initialName && slug.trim() === initialSlug;

  return (
    <form
      className="dk-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (reason.trim().length === 0) {
          setError("A reason is required to rename or re-slug a category.");
          return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        const result = await renameCategoryAction({ categoryId, name, slug, reason });
        setPending(false);
        if (result.ok) {
          setSuccess("Category name and slug updated.");
          setReason("");
          router.refresh();
        } else {
          setError(result.message ?? "Could not update this category. Please try again.");
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
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <div className="dk-field">
          <label className="dk-label dk-required" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className="dk-input"
            value={name}
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. Gardening"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="dk-field">
          <label className="dk-label dk-required" htmlFor={slugId}>
            Slug
          </label>
          <input
            id={slugId}
            className="dk-input"
            value={slug}
            required
            minLength={2}
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="e.g. gardening"
            onChange={(event) => setSlug(event.target.value)}
          />
        </div>
      </div>

      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor={reasonId}>
          Reason
        </label>
        <span className="dk-field-description">
          Required for any material name or slug change; recorded in the audit log.
        </span>
        <textarea
          id={reasonId}
          className="dk-textarea"
          rows={2}
          style={{ minHeight: 68 }}
          placeholder="Reason for changing category name or slug..."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
        <Button type="submit" variant="primary" loading={pending} disabled={unchanged}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
