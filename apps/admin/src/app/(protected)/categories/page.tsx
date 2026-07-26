import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { CategoryRow } from "@/lib/repository/types";
import { CreateCategoryForm } from "./CreateCategoryForm";

export const metadata: Metadata = { title: "Categories" };

const PAGE_SIZE = 20;

export default async function CategoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: "active" | "inactive"; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
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
      render: (row) => new Date(row.updatedAt).toLocaleString("en-PH"),
    },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => (
        <a className="dk-btn dk-btn-secondary dk-btn-sm" href={`/categories/${row.id}`}>
          Manage
        </a>
      ),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/categories?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Categories" }]} />
      <PageSection
        title="Categories"
        subtitle="Task categories are never deleted while tasks reference them — deactivate instead to remove a category from new task creation."
      >
        <div className="dk-card">
          <h2 style={{ marginTop: 0 }}>Add category</h2>
          <CreateCategoryForm />
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title="No categories"
            description="There are no categories matching this filter."
          />
        ) : (
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
        )}
      </PageSection>
    </>
  );
}
