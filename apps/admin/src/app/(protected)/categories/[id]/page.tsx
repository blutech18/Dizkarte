import type { Metadata } from "next";
import { Suspense, type SVGProps } from "react";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { RenameCategoryForm } from "./RenameCategoryForm";
import { CategoryStateControls } from "./CategoryStateControls";
import { ReorderCategoryForm } from "./ReorderCategoryForm";

export const metadata: Metadata = { title: "Category" };

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function TagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Category detail view.
 *
 * Designed with a consistent hero card, metrics overview, and responsive
 * two-column layout separating catalog settings from availability controls.
 */
export default async function CategoryDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { id } = await params;

  return (
    <div className="dk-detail">
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={3} />}>
        <CategoryRecord categoryId={id} />
      </Suspense>
    </div>
  );
}

async function CategoryRecord({ categoryId }: { readonly categoryId: string }) {
  const repository = getAdminRepository();
  const detail = await repository.getCategory(categoryId);

  if (!detail) {
    notFound();
  }

  const isEpochZero =
    !detail.updatedAt ||
    detail.updatedAt.startsWith("1970") ||
    new Date(detail.updatedAt).getTime() === 0;

  return (
    <>
      <nav className="dk-detail-nav" aria-label="Page navigation">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Categories", href: "/categories" },
            { label: detail.name },
          ]}
        />
        <AppLink className="dk-back-btn" href="/categories">
          <ArrowLeftIcon />
          <span>Back to categories</span>
        </AppLink>
      </nav>

      {/* Hero Header Card */}
      <header className="dk-booking-hero">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--dk-radius-md)",
                background: "rgba(110, 32, 223, 0.12)",
                color: "var(--dk-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <TagIcon width={22} height={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1
                  className="dk-booking-hero-title"
                  style={{ margin: 0, fontSize: "clamp(22px, 2.5vw, 28px)" }}
                >
                  {detail.name}
                </h1>
                <StatusBadge
                  tone={detail.active ? "success" : "neutral"}
                  label={detail.active ? "Active" : "Inactive"}
                />
              </div>
              <p
                className="dk-detail-header-meaning"
                style={{ margin: "4px 0 0 0", color: "var(--dk-textSecondary)" }}
              >
                {detail.active
                  ? "Clients can choose this category when posting a task."
                  : "Hidden from new task creation. Existing tasks keep their category."}
              </p>
            </div>
          </div>
        </div>

        {/* Hero Metrics Row */}
        <dl className="dk-booking-metrics">
          <Fact label="Slug">
            <span className="dk-ref-code" style={{ fontSize: 13.5 }}>
              {detail.slug}
            </span>
          </Fact>
          <Fact label="Display order">
            <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              #{detail.displayOrder}
            </span>
          </Fact>
          <Fact label="Tasks referencing">
            <AppLink
              href={`/tasks?q=${encodeURIComponent(detail.name)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: detail.taskCount > 0 ? "var(--dk-primary)" : "var(--dk-textMuted)",
                fontWeight: 700,
                textDecoration: "none",
              }}
              title={detail.taskCount > 0 ? "View tasks under this category" : undefined}
            >
              <span>
                {detail.taskCount} {detail.taskCount === 1 ? "task" : "tasks"}
              </span>
              {detail.taskCount > 0 ? <ExternalLinkIcon /> : null}
            </AppLink>
          </Fact>
          <Fact label="Last updated">
            {!isEpochZero ? (
              <time dateTime={detail.updatedAt} className="dk-datetime-cell">
                <span className="dk-datetime-date">{formatDate(detail.updatedAt)}</span>
                <span className="dk-datetime-time">{formatTime(detail.updatedAt)}</span>
              </time>
            ) : (
              <span className="dk-muted">Initial catalog</span>
            )}
          </Fact>
        </dl>
      </header>

      {/* Two-Column Responsive Content Grid */}
      <div className="dk-task-content-grid">
        {/* Main Column */}
        <div className="dk-task-main-col">
          <section className="dk-card dk-task-card" aria-labelledby="naming-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
              <h2 id="naming-heading">Name and slug</h2>
            </div>
            <p className="dk-card-note">
              Update the customer-facing category title and unique URL slug identifier.
            </p>
            <RenameCategoryForm categoryId={detail.id} name={detail.name} slug={detail.slug} />
          </section>

          <section className="dk-card dk-task-card" aria-labelledby="order-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 4 }}>
              <h2 id="order-heading">Marketplace display order</h2>
            </div>
            <p className="dk-card-note">
              Controls the sorting position of this category in client app task selectors.
            </p>
            <ReorderCategoryForm categoryId={detail.id} displayOrder={detail.displayOrder} />
          </section>

          <section className="dk-card dk-task-card" aria-labelledby="history-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 8 }}>
              <h2 id="history-heading">Audit history</h2>
            </div>
            {detail.history.length === 0 ? (
              <p className="dk-muted" style={{ margin: "8px 0" }}>
                No changes recorded for this category yet. Initial catalog entry.
              </p>
            ) : (
              <ul className="dk-history">
                {detail.history.map((event, index) => (
                  <li key={`${event.type}-${event.at}-${index}`}>
                    <div className="dk-history-head">
                      <strong>{historyLabel(event.type)}</strong>
                      <time className="dk-history-time" dateTime={event.at}>
                        {formatDateTime(event.at)}
                      </time>
                    </div>
                    <p className="dk-history-meta">
                      {event.fromValue ? `${event.fromValue} → ${event.toValue}` : event.toValue} ·{" "}
                      {event.actor}
                      {event.capability ? ` · ${event.capability}` : ""}
                    </p>
                    {event.reason ? (
                      <blockquote className="dk-quote" style={{ marginTop: 8 }}>
                        {event.reason}
                      </blockquote>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar Column */}
        <div className="dk-task-side-col">
          <section className="dk-card dk-task-card" aria-labelledby="state-heading">
            <div className="dk-card-header-flex" style={{ marginBottom: 12 }}>
              <h2 id="state-heading" style={{ fontSize: 16 }}>
                Availability
              </h2>
              <StatusBadge
                tone={detail.active ? "success" : "neutral"}
                label={detail.active ? "Active" : "Inactive"}
              />
            </div>

            <p className="dk-card-note" style={{ marginBottom: 18 }}>
              {detail.active ? (
                detail.taskCount > 0 ? (
                  <>
                    <strong>{detail.taskCount}</strong> task{detail.taskCount === 1 ? "" : "s"}{" "}
                    currently reference this category. Deactivating hides it from new task creation
                    without deleting existing tasks or bookings.
                  </>
                ) : (
                  "No tasks currently reference this category. Deactivating hides it from new task creation."
                )
              ) : (
                "This category is currently hidden. Existing tasks retain their category, but clients cannot select it for new tasks."
              )}
            </p>

            <CategoryStateControls categoryId={detail.id} active={detail.active} />
          </section>

          <section className="dk-card dk-task-card" aria-labelledby="quick-ref-heading">
            <h2 id="quick-ref-heading" style={{ fontSize: 16, marginBottom: 14 }}>
              Quick reference
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  background: "var(--dk-bg-subtle, rgba(0, 0, 0, 0.02))",
                  border: "1px solid var(--dk-border)",
                  borderRadius: "var(--dk-radius-md)",
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--dk-textSecondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Category ID
                  </span>
                  <CopyButton text={detail.id} label="Category ID" />
                </div>
                <code
                  style={{
                    display: "block",
                    fontFamily: "var(--dk-font-mono, monospace)",
                    fontSize: 12,
                    wordBreak: "break-all",
                    color: "var(--dk-text)",
                  }}
                >
                  {detail.id}
                </code>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    border: "1px solid var(--dk-border)",
                    borderRadius: "var(--dk-radius-md)",
                    padding: "10px 12px",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--dk-textSecondary)",
                      marginBottom: 6,
                    }}
                  >
                    Catalog status
                  </span>
                  <StatusBadge
                    tone={detail.active ? "success" : "neutral"}
                    label={detail.active ? "Active" : "Inactive"}
                  />
                </div>

                <div
                  style={{
                    border: "1px solid var(--dk-border)",
                    borderRadius: "var(--dk-radius-md)",
                    padding: "10px 12px",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--dk-textSecondary)",
                      marginBottom: 4,
                    }}
                  >
                    Display rank
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--dk-text)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{detail.displayOrder}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  border: "1px solid var(--dk-border)",
                  borderRadius: "var(--dk-radius-md)",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--dk-textSecondary)",
                    }}
                  >
                    Referencing tasks
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>
                    {detail.taskCount} {detail.taskCount === 1 ? "task" : "tasks"}
                  </span>
                </div>
                {detail.taskCount > 0 ? (
                  <AppLink
                    href={`/tasks?q=${encodeURIComponent(detail.name)}`}
                    className="dk-btn dk-btn-secondary dk-btn-sm"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <span>View</span>
                    <ExternalLinkIcon />
                  </AppLink>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="dk-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** `slug_changed` is a database event name; an operator reads a sentence. */
function historyLabel(type: string): string {
  switch (type) {
    case "created":
      return "Created";
    case "renamed":
      return "Renamed";
    case "slug_changed":
      return "Slug changed";
    case "reordered":
      return "Display order changed";
    case "activated":
      return "Activated";
    case "deactivated":
      return "Deactivated";
    default:
      return type.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
  }
}
