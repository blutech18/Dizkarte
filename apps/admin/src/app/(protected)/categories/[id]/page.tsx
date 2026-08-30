import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { DetailRegionSkeleton } from "@/components/ui/AsyncState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RenameCategoryForm } from "./RenameCategoryForm";
import { CategoryStateControls } from "./CategoryStateControls";
import { ReorderCategoryForm } from "./ReorderCategoryForm";

export const metadata: Metadata = { title: "Category" };

/**
 * Category detail.
 *
 * The whole body is one category record, so the shell shown without waiting is
 * deliberately small: the breadcrumb trail. It is proof the operator is on the
 * right page and a way back to the list if the record is slow, so it is returned
 * immediately while the record streams in behind its own boundary.
 *
 * The final breadcrumb is a static label rather than the category name: the name
 * is already the page's h1, so repeating it bought nothing and would have held
 * the whole trail back until the query returned.
 */
export default async function CategoryDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { id } = await params;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Categories", href: "/categories" },
          { label: "Category" },
        ]}
      />
      <Suspense fallback={<DetailRegionSkeleton cards={4} lines={3} />}>
        <CategoryRecord categoryId={id} />
      </Suspense>
    </>
  );
}

async function CategoryRecord({ categoryId }: { readonly categoryId: string }) {
  const repository = getAdminRepository();
  const detail = await repository.getCategory(categoryId);

  if (!detail) {
    notFound();
  }

  return (
    <div className="dk-detail">
      <header className="dk-detail-header">
        <div className="dk-detail-header-main">
          <h1>{detail.name}</h1>
          <StatusBadge
            tone={detail.active ? "success" : "neutral"}
            label={detail.active ? "Active" : "Inactive"}
          />
        </div>
        <p className="dk-detail-header-meaning">
          {detail.active
            ? "Clients can choose this category when posting a task."
            : "Hidden from new task creation. Existing tasks keep their category."}
        </p>
        <dl className="dk-detail-header-meta">
          <Fact label="Slug">
            <code>{detail.slug}</code>
          </Fact>
          <Fact label="Display order">{detail.displayOrder}</Fact>
          <Fact label="Tasks referencing">{detail.taskCount}</Fact>
          <Fact label="Last updated">
            <time dateTime={detail.updatedAt}>{formatDateTime(detail.updatedAt)}</time>
          </Fact>
        </dl>
      </header>

      <section className="dk-card" aria-labelledby="naming-heading">
        <h2 id="naming-heading">Name and slug</h2>
        <RenameCategoryForm categoryId={detail.id} name={detail.name} slug={detail.slug} />
      </section>

      <section className="dk-card" aria-labelledby="order-heading">
        <h2 id="order-heading">Display order</h2>
        <ReorderCategoryForm categoryId={detail.id} displayOrder={detail.displayOrder} />
      </section>

      <section className="dk-card" aria-labelledby="state-heading">
        <h2 id="state-heading">Availability</h2>
        {detail.taskCount > 0 && detail.active ? (
          <p className="dk-card-note">
            {detail.taskCount} task{detail.taskCount === 1 ? "" : "s"} reference this category.
            Deactivating hides it from new task creation without deleting it or those tasks.
          </p>
        ) : null}
        <CategoryStateControls categoryId={detail.id} active={detail.active} />
      </section>

      <section className="dk-card" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        {detail.history.length === 0 ? (
          <p className="dk-muted">No change recorded for this category yet.</p>
        ) : (
          /*
            A seven-column table for a change log forced horizontal scrolling and
            put the reason — the part that explains the change — in the narrowest
            cell. The same records read better as a list.
          */
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
                {event.reason ? <blockquote className="dk-quote">{event.reason}</blockquote> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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

