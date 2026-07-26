import type { ReactNode } from "react";

export type PaginationProps = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly makeHref: (page: number) => string;
};

export function Pagination({ page, pageSize, total, hasMore, makeHref }: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav className="dk-pagination" aria-label="Pagination">
      <span>{total === 0 ? "No results" : `Showing ${start}–${end} of ${total}`}</span>
      <span className="dk-row">
        <PageLink direction="Previous" {...(page > 1 ? { href: makeHref(page - 1) } : {})} />
        <span aria-current="page">Page {page}</span>
        <PageLink direction="Next" {...(hasMore ? { href: makeHref(page + 1) } : {})} />
      </span>
    </nav>
  );
}

function PageLink({
  direction,
  href,
}: {
  readonly direction: "Previous" | "Next";
  readonly href?: string;
}) {
  const label = `${direction} page`;
  if (!href) {
    return (
      <span className="dk-btn dk-btn-secondary dk-btn-sm" aria-disabled="true">
        {direction}
      </span>
    );
  }
  return (
    <a className="dk-btn dk-btn-secondary dk-btn-sm" href={href} aria-label={label}>
      {direction}
    </a>
  );
}
export function PageSection({
  title,
  subtitle,
  actions,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{title}</h1>
          {subtitle ? <p className="dk-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="dk-page-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
