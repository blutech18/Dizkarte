"use client";

import {
  useEffect,
  useRef,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

export type FilterFormProps = {
  /** Route the filters apply to, e.g. `/tasks`. */
  readonly basePath: string;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Apply automatically as the operator interacts, with no submit button.
   *
   * A `<select>` applies immediately — the choice is complete the moment it
   * changes. Text fields wait for `debounceMs` of quiet instead, because
   * applying per keystroke would fire a request for every prefix of the word.
   */
  readonly autoApply?: boolean;
  readonly debounceMs?: number;
};

/**
 * Search/filter form for the queue pages.
 *
 * Still a real `<form method="get" action={basePath}>`, so it submits and works
 * with JavaScript disabled. When JavaScript is available the submit is handled
 * here and turned into a client-side navigation instead: a plain GET submit is a
 * full document load, which tears down and re-boots the whole console just to
 * change a query string.
 *
 * Empty fields are dropped so the resulting URL only carries filters that are
 * actually applied — a shareable link rather than a trail of empty parameters.
 * `page` is deliberately not carried over: changing a filter must return to the
 * first page, because page 4 of the previous result set is rarely a valid page
 * of the new one.
 */
export function FilterForm({
  basePath,
  children,
  className,
  autoApply = false,
  debounceMs = 350,
}: FilterFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending keystroke must not navigate after the page has moved on.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (key === "page") continue;
      if (typeof value === "string" && value.trim() !== "") params.set(key, value.trim());
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath);
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    apply(event.currentTarget);
  }

  function onChange(event: ChangeEvent<HTMLFormElement>) {
    if (!autoApply) return;
    // `currentTarget` is cleared once the handler returns, so hold the form.
    const form = event.currentTarget;

    if (event.target instanceof HTMLSelectElement) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      apply(form);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply(form), debounceMs);
  }

  return (
    <form
      method="get"
      action={basePath}
      onSubmit={onSubmit}
      onChange={onChange}
      className={className}
      role="search"
      aria-busy={pending}
    >
      {children}
    </form>
  );
}
