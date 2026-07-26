import type { ReactNode } from "react";

/**
 * Shared loading-skeleton state. Server Components render this while awaiting
 * data (via `<Suspense>` boundaries) so every list/detail view has a
 * consistent, accessible loading state instead of a blank screen.
 */
export function LoadingState({
  rows = 5,
  label = "Loading",
}: {
  readonly rows?: number;
  readonly label?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">{label}…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="dk-skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="dk-state" role="status">
      <p className="dk-state-title">{title}</p>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If the problem continues, contact engineering support.",
  action,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="dk-state" role="alert">
      <p className="dk-state-title">{title}</p>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function DeniedState({
  title = "Access restricted",
  description = "Your Admin capability does not permit viewing this page.",
}: {
  readonly title?: string;
  readonly description?: string;
}) {
  return (
    <div className="dk-state" role="alert">
      <p className="dk-state-title">{title}</p>
      <p>{description}</p>
    </div>
  );
}

/**
 * Assignment-gated case detail restriction (requirement 4.6.6). Rendered
 * instead of narrative/evidence when the current Admin is not the explicit
 * assignee of a report/dispute/ticket — queue metadata may still be listed by
 * capability, but detail content is never shown without assignment.
 */
export function RestrictedCaseNotice({
  reason,
}: {
  readonly reason: "unassigned" | "assigned-to-other";
}) {
  return (
    <div className="dk-state" role="status">
      <p className="dk-state-title">Restricted — sensitive detail not shown</p>
      <p>
        {reason === "unassigned"
          ? "This case is not yet assigned. Assign it to yourself to view the narrative, evidence, and full history."
          : "This case is assigned to a different Admin. Only the assigned Admin can view its narrative, evidence, and full history."}
      </p>
    </div>
  );
}

export function ConfigurationBlockedState({
  violations,
}: {
  readonly violations: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}) {
  return (
    <div className="dk-state" role="alert">
      <p className="dk-state-title">Configuration incomplete</p>
      <p>
        This environment is missing required configuration and has failed closed rather than running
        with placeholder/synthetic behavior.
      </p>
      <ul style={{ textAlign: "left" }}>
        {violations.map((violation, index) => (
          <li key={index}>
            <code>{violation.code}</code>: {violation.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
