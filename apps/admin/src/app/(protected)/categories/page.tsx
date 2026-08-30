import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { formatDateTime } from "@/lib/datetime";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { CategoryRow } from "@/lib/repository/types";
import { CreateCategoryForm } from "./CreateCategoryForm";

export const metadata: Metadata = { title: "Categories" };

const PAGE_SIZE = 20;

type CategoriesQuery = {
  readonly page: number;
  readonly status: "active" | "inactive" | undefined;
};

/**
 * Categories.
 *
 * The shell — breadcrumbs, heading, and the "Add category" form — depends on no
 * query, so it is returned immediately and the results table streams in behind
 * its own Suspense boundary. The create form in particular is a control the
 * operator can start filling in before any category has loaded.
 *
 * The boundary is keyed by the applied status and page so changing the filter
 * shows the skeleton again rather than leaving the previous result set on screen
 * looking like the answer to the new query.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: "active" | "inactive"; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Categories" }]} />
      <PageSection
        title="Categories"
        subtitle="Task categories are never deleted while tasks reference them — deactivate instead to remove a category from new task creation."
      >
        <div className="dk-card">
          <h2>Add category</h2>
          <CreateCategoryForm />
        </div>

        <Suspense key={`${status ?? ""}|${page}`} fallback={<TableRegionSkeleton columns={7} />}>
          <CategoriesTable page={page} status={status} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function CategoriesTable({ page, status }: CategoriesQuery) {
  const repository = getAdminRepository();
  const result = await repository.listCategories({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<CategoryRow>> = [
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "slug", header: "Slug", render: (row) => <code>{row.slug}</code> },
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
    { key: "displayOrder", header: "Order", render: (row) => row.displayOrder },
    { key: "taskCount", header: "Tasks", render: (row) => row.taskCount },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt)}</time>,
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <AppLink className="dk-btn dk-btn-secondary dk-btn-sm" href={`/categories/${row.id}`}>
          Manage
        </AppLink>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/categories?${params.toString()}`;
  }

  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No categories"
        description="There are no categories matching this filter."
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

