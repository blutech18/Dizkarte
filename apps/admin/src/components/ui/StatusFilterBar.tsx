import Link from "next/link";

export type StatusFilterBarProps = {
  /** Route the filters link to, e.g. `/media`. */
  readonly basePath: string;
  readonly options: ReadonlyArray<string>;
  /** Currently applied status, or `undefined` when showing everything. */
  readonly active: string | undefined;
  /** Maps a raw status to plain language. Defaults to the raw value. */
  readonly label?: (status: string) => string;
  readonly allLabel?: string;
  /** Query key used for the status. */
  readonly paramName?: string;
};

/**
 * Status filter row shared by the queue pages.
 *
 * Two things it fixes over the per-page versions it replaces: the tabs showed raw
 * enum values like `COMPLETION_REQUESTED`, which is database vocabulary in front
 * of a support agent; and the selected tab was marked only with `aria-current`,
 * so it was announced to a screen reader but invisible to everyone else. Here the
 * active tab is also styled, and the whole row is a labelled `nav`.
 */
export function StatusFilterBar({
  basePath,
  options,
  active,
  label = (status) => status,
  allLabel = "All",
  paramName = "status",
}: StatusFilterBarProps) {
  const showingAll = active === undefined;

  return (
    <nav aria-label="Filter by status" className="dk-row" style={{ marginBottom: 16 }}>
      <Link
        className={`dk-btn dk-btn-sm ${showingAll ? "dk-btn-primary" : "dk-btn-secondary"}`}
        href={`${basePath}?${paramName}=all`}
        aria-current={showingAll ? "page" : undefined}
      >
        {allLabel}
      </Link>
      {options.map((option) => {
        const isActive = active === option;
        return (
          <Link
            key={option}
            className={`dk-btn dk-btn-sm ${isActive ? "dk-btn-primary" : "dk-btn-secondary"}`}
            href={`${basePath}?${paramName}=${encodeURIComponent(option)}`}
            aria-current={isActive ? "page" : undefined}
          >
            {label(option)}
          </Link>
        );
      })}
    </nav>
  );
}
