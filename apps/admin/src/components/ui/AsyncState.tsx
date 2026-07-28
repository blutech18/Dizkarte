import type { ReactNode } from "react";

/* ---------- Skeleton primitives ---------- */

/**
 * Base skeleton bone. Accepts preset size modifiers via the `variant` prop.
 * All variants share the shared shimmer animation from globals.css.
 */
export function SkeletonBone({
  variant = "text",
  style,
}: {
  readonly variant?:
    | "title"
    | "subtitle"
    | "text"
    | "text-sm"
    | "badge"
    | "breadcrumb"
    | "input"
    | "btn";
  readonly style?: React.CSSProperties;
}) {
  return (
    <span
      className={`dk-skeleton-bone dk-skeleton-bone--${variant}`}
      aria-hidden="true"
      style={style}
    />
  );
}

/** Simulates the Breadcrumbs bar that appears at the top of every page. */
export function SkeletonBreadcrumb() {
  return <SkeletonBone variant="breadcrumb" />;
}

/** Simulates the dk-page-header block (title + subtitle + optional badge). */
export function SkeletonPageHeader({ badge = false }: { readonly badge?: boolean } = {}) {
  return (
    <div className="dk-skeleton-header">
      <div className="dk-skeleton-header__left">
        <SkeletonBone variant="title" />
        <SkeletonBone variant="subtitle" />
      </div>
      {badge ? <SkeletonBone variant="badge" /> : null}
    </div>
  );
}

/** Simulates a row of filter buttons / search input. */
export function SkeletonFilterRow({ count = 3 }: { readonly count?: number } = {}) {
  return (
    <div className="dk-skeleton-filters">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBone key={i} variant="btn" style={{ width: `${60 + i * 16}px` }} />
      ))}
    </div>
  );
}

/**
 * Simulates a dk-table-wrap table with a header row and `rows` body rows.
 * The `columns` count determines the grid layout.
 */
export function SkeletonTable({
  columns = 4,
  rows = 5,
}: {
  readonly columns?: 3 | 4 | 5 | 6;
  readonly rows?: number;
} = {}) {
  return (
    <div className={`dk-skeleton-table dk-skeleton-table--cols-${columns}`} aria-hidden="true">
      <div className="dk-skeleton-table__head">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBone key={i} variant="text-sm" style={{ width: i === 0 ? "80%" : "60%" }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="dk-skeleton-table__row">
          {Array.from({ length: columns }).map((_, ci) => (
            <SkeletonBone
              key={ci}
              variant={ci === 1 ? "badge" : "text"}
              style={ci === 0 ? { width: "85%" } : { width: ci > 1 ? "70%" : "72px" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Simulates the Pagination bar below tables. */
export function SkeletonPagination() {
  return (
    <div className="dk-skeleton-pagination">
      <SkeletonBone variant="text-sm" style={{ width: 120 }} />
      <div className="dk-skeleton-pagination__nav">
        <SkeletonBone variant="btn" />
        <SkeletonBone variant="text-sm" style={{ width: 50 }} />
        <SkeletonBone variant="btn" />
      </div>
    </div>
  );
}

/** Simulates the dashboard stat-card grid. */
export function SkeletonCardGrid({ count = 6 }: { readonly count?: number } = {}) {
  return (
    <div className="dk-skeleton-card-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dk-skeleton-stat-card">
          <SkeletonBone variant="text-sm" style={{ width: "75%" }} />
          <SkeletonBone variant="title" style={{ width: "50%" }} />
          <SkeletonBone variant="text-sm" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

/** Simulates a dk-card detail section with a heading and content lines. */
export function SkeletonDetailCard({ lines = 3 }: { readonly lines?: number } = {}) {
  return (
    <div className="dk-skeleton-detail-card" aria-hidden="true">
      <SkeletonBone variant="text-sm" style={{ width: "35%" }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBone key={i} variant="text" style={{ width: `${85 - i * 10}%` }} />
      ))}
    </div>
  );
}

/* ---------- Composed page-level skeletons ---------- */

/**
 * Full-page skeleton for list pages (users, verification, categories, etc).
 * Shows breadcrumb → header → filter row → table → pagination.
 */
export function ListPageSkeleton({
  columns = 4,
  rows = 5,
  filters = 3,
}: {
  readonly columns?: 3 | 4 | 5 | 6;
  readonly rows?: number;
  readonly filters?: number;
} = {}) {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading…</span>
      <SkeletonBreadcrumb />
      <SkeletonPageHeader />
      {filters > 0 ? <SkeletonFilterRow count={filters} /> : null}
      <SkeletonTable columns={columns} rows={rows} />
      <SkeletonPagination />
    </div>
  );
}

/**
 * Full-page skeleton for detail pages (user/:id, verification/:id, etc).
 * Shows breadcrumb → header with badge → N detail cards.
 */
export function DetailPageSkeleton({
  cards = 3,
}: {
  readonly cards?: number;
} = {}) {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading…</span>
      <SkeletonBreadcrumb />
      <SkeletonPageHeader badge />
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonDetailCard key={i} lines={i === 0 ? 4 : 3} />
      ))}
    </div>
  );
}

/**
 * Full-page skeleton for the dashboard page.
 * Shows header → card grid section × 2.
 */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="dk-visually-hidden">Loading…</span>
      <SkeletonPageHeader />
      <div style={{ marginBottom: 32 }}>
        <SkeletonBone variant="text-sm" style={{ width: 160, marginBottom: 16 }} />
        <SkeletonCardGrid count={4} />
      </div>
      <div>
        <SkeletonBone variant="text-sm" style={{ width: 200, marginBottom: 16 }} />
        <SkeletonCardGrid count={3} />
      </div>
    </div>
  );
}

/**
 * Original loading state — kept for backward compatibility.
 * New pages should prefer the composed skeletons above.
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
      <div className="dk-state-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
      </div>
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
      <div className="dk-state-icon" style={{ background: "var(--dk-errorSoft)", color: "var(--dk-errorOnSoft)" }} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
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
      <div className="dk-state-icon" style={{ background: "var(--dk-warningSoft)", color: "var(--dk-warningOnSoft)" }} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
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
