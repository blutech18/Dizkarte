import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export function Breadcrumbs({
  items,
}: {
  readonly items: ReadonlyArray<{ label: string; href?: string }>;
}) {
  return (
    <nav className="dk-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {item.href && !isLast ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current={isLast ? "page" : undefined} style={{ fontWeight: isLast ? 700 : 500, color: isLast ? "var(--dk-textPrimary)" : "inherit" }}>
                {item.label}
              </span>
            )}
            {!isLast ? (
              <span aria-hidden="true" className="dk-breadcrumbs-sep">
                ›
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

export function Field({
  id,
  label,
  required,
  description,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  const describedBy =
    [description ? `${id}-desc` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  // Wire the accessible relationships onto the actual control element so
  // assistive tech announces the description and error, and exposes the invalid
  // state. The first valid child element receives the field id (so `htmlFor`
  // resolves), merged `aria-describedby`, `aria-invalid`, and `aria-required`.
  let controlWired = false;
  const control = Children.map(children, (child): ReactNode => {
    if (controlWired || !isValidElement(child)) return child;
    controlWired = true;
    const el = child as ReactElement<Record<string, unknown>>;
    const existingDescribedBy =
      typeof el.props["aria-describedby"] === "string" ? el.props["aria-describedby"] : undefined;
    const mergedDescribedBy =
      [existingDescribedBy, describedBy].filter(Boolean).join(" ") || undefined;
    return cloneElement(el, {
      // Field owns the id so the label's `htmlFor` always associates with the
      // control — a caller-supplied id on the control is intentionally replaced.
      id,
      "aria-describedby": mergedDescribedBy,
      "aria-invalid": error ? true : el.props["aria-invalid"],
      "aria-required": required ? true : el.props["aria-required"],
    });
  });

  return (
    <div className="dk-field">
      <label htmlFor={id} className={`dk-label ${required ? "dk-required" : ""}`}>
        {label}
      </label>
      {description ? (
        <span id={`${id}-desc`} className="dk-field-description">
          {description}
        </span>
      ) : null}
      {control}
      {error ? (
        <p id={`${id}-error`} className="dk-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
