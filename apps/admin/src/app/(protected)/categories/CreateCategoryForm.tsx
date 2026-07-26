"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createCategoryAction } from "./actions";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateCategoryForm() {
  const router = useRouter();
  const nameId = useId();
  const slugId = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form
      className="dk-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setSuccess(null);
        const result = await createCategoryAction({ name, slug });
        setPending(false);
        if (result.ok) {
          setSuccess(`Category "${name}" was created.`);
          setName("");
          setSlug("");
          setSlugTouched(false);
          router.refresh();
        } else {
          setError(result.message ?? "Could not create this category. Please try again.");
        }
      }}
      aria-describedby={error ? `${nameId}-form-error` : undefined}
    >
      {error ? (
        <p id={`${nameId}-form-error`} role="alert" className="dk-field-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="dk-field-description">
          {success}
        </p>
      ) : null}
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
          onChange={(event) => {
            const value = event.target.value;
            setName(value);
            if (!slugTouched) setSlug(slugify(value));
          }}
        />
      </div>
      <div className="dk-field">
        <label className="dk-label dk-required" htmlFor={slugId}>
          Slug
        </label>
        <span id={`${slugId}-desc`} className="dk-field-description">
          Lowercase letters, numbers, and hyphens only (e.g. home-cleaning).
        </span>
        <input
          id={slugId}
          className="dk-input"
          value={slug}
          required
          minLength={2}
          maxLength={60}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby={`${slugId}-desc`}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
      </div>
      <div>
        <Button type="submit" variant="primary" loading={pending}>
          Add category
        </Button>
      </div>
    </form>
  );
}
