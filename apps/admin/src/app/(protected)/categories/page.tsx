import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDate, formatTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { CategoryRow } from "@/lib/repository/types";
import { QueueFilters } from "@/components/ui/QueueFilters";
import { CreateCategoryModal } from "./CreateCategoryModal";

export const metadata: Metadata = { title: "Categories" };

const PAGE_SIZE = 20;

export const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "tasks", label: "Most tasks" },
  { value: "updated", label: "Recently updated" },
  { value: "order_desc", label: "Display order (desc)" },
] as const;

type CategoriesQuery = {
  readonly page: number;
  readonly status: "active" | "inactive" | undefined;
  readonly q: string | undefined;
  readonly sort: string | undefined;
};

/**
 * Categories catalog management.
 *
 * The shell — breadcrumbs, heading, header action, and filter row — depends on
 * no query, so it is returned immediately and the results table streams in behind
 * its own Suspense boundary.
 *
 * The boundary is keyed by the applied filters and page so changing a filter
 * shows the skeleton again rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: "active" | "inactive";
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { status, q, sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const activeStatus = status === "active" || status === "inactive" ? status : undefined;
  const activeSort = sort && SORT_OPTIONS.some((opt) => opt.value === sort) ? sort : undefined;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Categories" }]} />
      <PageSection
        title="Categories"
        subtitle="Task categories are never deleted while tasks reference them — deactivate instead to remove a category from new task creation."
        actions={<CreateCategoryModal />}
      >
        <QueueFilters
          basePath="/categories"
          search={{
            label: "Search categories by name or slug",
            placeholder: "Search name or slug...",
            value: q?.trim() ?? "",
          }}
          selects={[
            {
              name: "status",
              label: "Filter by category state",
              allLabel: "All categories",
              value: activeStatus,
              options: [
                { value: "active", label: "Active only" },
                { value: "inactive", label: "Inactive only" },
              ],
            },
            {
              name: "sort",
              label: "Sort categories",
              allLabel: "Display order (asc)",
              value: activeSort,
              options: SORT_OPTIONS,
            },
          ]}
        />

        <Suspense
          key={`${activeStatus ?? ""}|${q?.trim() ?? ""}|${activeSort ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={7} />}
        >
          <CategoriesTable
            page={page}
            status={activeStatus}
            q={q?.trim() || undefined}
            sort={activeSort}
          />
        </Suspense>
      </PageSection>
    </>
  );
}

async function CategoriesTable({ page, status, q, sort }: CategoriesQuery) {
  const repository = getAdminRepository();
  const result = await repository.listCategories({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(sort ? { sort } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<CategoryRow>> = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <AppLink
          href={`/categories/${row.id}`}
          style={{ fontWeight: 650, color: "var(--dk-textPrimary)" }}
        >
          {row.name}
        </AppLink>
      ),
    },
    {
      key: "slug",
      header: "Slug",
      render: (row) => <span className="dk-ref-code">{row.slug}</span>,
    },
    {
      key: "active",
      header: "State",
      render: (row) => (
        <StatusBadge
          tone={row.active ? "success" : "neutral"}
          label={row.active ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "displayOrder",
      header: "Order",
      render: (row) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          #{row.displayOrder}
        </span>
      ),
    },
    {
      key: "taskCount",
      header: "Tasks",
      render: (row) => (
        <span
          style={{
            fontWeight: row.taskCount > 0 ? 600 : 400,
            color: row.taskCount > 0 ? "var(--dk-textPrimary)" : "var(--dk-textMuted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.taskCount} {row.taskCount === 1 ? "task" : "tasks"}
        </span>
      ),
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => {
        const isEpochZero =
          !row.updatedAt ||
          row.updatedAt.startsWith("1970") ||
          new Date(row.updatedAt).getTime() === 0;
        if (isEpochZero) {
          return <span className="dk-muted">—</span>;
        }
        return (
          <time dateTime={row.updatedAt} title={row.updatedAt} className="dk-datetime-cell">
            <span className="dk-datetime-date">{formatDate(row.updatedAt)}</span>
            <span className="dk-datetime-time">{formatTime(row.updatedAt)}</span>
          </time>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink
          className="dk-btn dk-btn-secondary dk-btn-sm"
          href={`/categories/${row.id}`}
          style={{ padding: "4px 12px", fontSize: 12, minHeight: 28, textDecoration: "none" }}
        >
          Manage
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    params.set("page", String(nextPage));
    return `/categories?${params.toString()}`;
  }

  if (result.items.length === 0) {
    const hasFilters = Boolean(status || q || sort);
    return (
      <EmptyState
        title={hasFilters ? "No matching categories" : "No categories"}
        description={
          hasFilters
            ? "No categories match your active filters. Try clearing your search or state filter."
            : "There are no categories in the catalog."
        }
      />
    );
  }

  return (
    <>
      <RecordList
        rows={result.items}
        columns={columns}
        getRowKey={(row) => row.id}
        caption="Categories"
        cardTitle={(row) => row.name}
      />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hasMore={result.hasMore}
        makeHref={hrefFor}
      />
    </>
  );
}
